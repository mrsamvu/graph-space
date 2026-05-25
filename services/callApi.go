package services

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type CallAPIService struct {
	ctx           context.Context
	client        *http.Client
	jar           http.CookieJar
	cookieMutex   sync.Mutex
	cookies       map[string]HTTPCookie
	subMutex      sync.Mutex
	subscriptions map[string]*subscriptionHandle
}

type subscriptionHandle struct {
	conn   *websocket.Conn
	cancel context.CancelFunc
}

type APIRequest struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
}

type SubscriptionRequest struct {
	ID        string            `json:"id"`
	URL       string            `json:"url"`
	Headers   map[string]string `json:"headers"`
	Query     string            `json:"query"`
	Variables map[string]any    `json:"variables"`
}

type APIResponse struct {
	StatusCode int               `json:"statusCode"`
	Status     string            `json:"status"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	Cookies    []HTTPCookie      `json:"cookies"`
	Duration   int64             `json:"duration"` // milliseconds
	Size       int64             `json:"size"`     // response body bytes
	Error      string            `json:"error,omitempty"`
}

type HTTPCookie struct {
	Name     string `json:"name"`
	Value    string `json:"value"`
	Domain   string `json:"domain"`
	Path     string `json:"path"`
	Expires  string `json:"expires"`
	HTTPOnly bool   `json:"httpOnly"`
	Secure   bool   `json:"secure"`
}

type SubscriptionEvent struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Payload string `json:"payload"`
	Error   string `json:"error,omitempty"`
}

func NewCallAPIService() *CallAPIService {
	jar, _ := cookiejar.New(nil)
	return &CallAPIService{
		jar: jar,
		client: &http.Client{
			Timeout: 30 * time.Second,
			Jar:     jar,
		},
		cookies:       map[string]HTTPCookie{},
		subscriptions: map[string]*subscriptionHandle{},
	}
}

func (c *CallAPIService) Startup(ctx context.Context) {
	c.ctx = ctx
}

func (c *CallAPIService) SendRequest(req APIRequest) APIResponse {
	// Chuẩn bị body
	var bodyReader io.Reader
	if req.Body != "" {
		bodyReader = bytes.NewBufferString(req.Body)
	}

	// Tạo HTTP request
	httpReq, err := http.NewRequest(req.Method, req.URL, bodyReader)
	if err != nil {
		return APIResponse{Error: fmt.Sprintf("Không thể tạo request: %s", err.Error())}
	}

	// Gắn headers
	for key, value := range req.Headers {
		httpReq.Header.Set(key, value)
	}

	// Measure like Postman/Apollo client timing: from sending the HTTP request
	// until the full response body has been received.
	start := time.Now()
	resp, err := c.client.Do(httpReq)
	if err != nil {
		return APIResponse{
			Error:    fmt.Sprintf("Không thể kết nối: %s", err.Error()),
			Duration: time.Since(start).Milliseconds(),
		}
	}
	defer resp.Body.Close()

	// Đọc response body
	respBody, err := io.ReadAll(resp.Body)
	duration := time.Since(start).Milliseconds()
	if err != nil {
		return APIResponse{
			StatusCode: resp.StatusCode,
			Status:     resp.Status,
			Error:      fmt.Sprintf("Không thể đọc response: %s", err.Error()),
			Duration:   duration,
		}
	}

	// Thu thập response headers
	respHeaders := make(map[string]string)
	for key, values := range resp.Header {
		respHeaders[key] = strings.Join(values, ", ")
	}

	cookies := c.rememberCookies(resp.Request.URL, resp.Cookies())

	return APIResponse{
		StatusCode: resp.StatusCode,
		Status:     resp.Status,
		Headers:    respHeaders,
		Body:       string(respBody),
		Cookies:    cookies,
		Duration:   duration,
		Size:       int64(len(respBody)),
	}
}

func (c *CallAPIService) rememberCookies(requestURL *url.URL, responseCookies []*http.Cookie) []HTTPCookie {
	c.cookieMutex.Lock()
	defer c.cookieMutex.Unlock()

	host := ""
	if requestURL != nil {
		host = requestURL.Hostname()
	}

	for _, cookie := range responseCookies {
		domain := cookie.Domain
		if domain == "" {
			domain = host
		}

		path := cookie.Path
		if path == "" {
			path = "/"
		}

		expires := ""
		if !cookie.Expires.IsZero() {
			expires = cookie.Expires.Format(time.RFC1123)
		}

		item := HTTPCookie{
			Name:     cookie.Name,
			Value:    cookie.Value,
			Domain:   domain,
			Path:     path,
			Expires:  expires,
			HTTPOnly: cookie.HttpOnly,
			Secure:   cookie.Secure,
		}

		c.cookies[c.cookieKey(item)] = item
	}

	items := make([]HTTPCookie, 0, len(c.cookies))
	for _, cookie := range c.cookies {
		if host != "" && cookie.Domain != "" {
			domain := strings.TrimPrefix(cookie.Domain, ".")
			if host != domain && !strings.HasSuffix(host, "."+domain) {
				continue
			}
		}
		items = append(items, cookie)
	}

	return items
}

func (c *CallAPIService) cookieKey(cookie HTTPCookie) string {
	return cookie.Domain + "|" + cookie.Path + "|" + cookie.Name
}

func (c *CallAPIService) StartSubscription(req SubscriptionRequest) error {
	if strings.TrimSpace(req.ID) == "" {
		return fmt.Errorf("subscription id is required")
	}

	if err := c.startWebSocketSubscription(req); err == nil {
		return nil
	}

	return c.startSSESubscription(req)
}

func (c *CallAPIService) startWebSocketSubscription(req SubscriptionRequest) error {
	if strings.TrimSpace(req.ID) == "" {
		return fmt.Errorf("subscription id is required")
	}

	wsURL, err := toWebSocketURL(req.URL)
	if err != nil {
		return err
	}

	header := http.Header{}
	for key, value := range req.Headers {
		if strings.EqualFold(key, "content-type") {
			continue
		}
		header.Set(key, value)
	}

	dialer := websocket.Dialer{
		HandshakeTimeout:  30 * time.Second,
		Jar:               c.jar,
		Subprotocols:      []string{"graphql-transport-ws", "graphql-ws"},
		EnableCompression: true,
	}

	conn, resp, err := dialer.Dial(wsURL, header)
	if resp != nil {
		parsedURL, _ := url.Parse(wsURL)
		c.rememberCookies(parsedURL, resp.Cookies())
	}
	if err != nil {
		return fmt.Errorf("cannot connect subscription websocket: %w", err)
	}

	c.subMutex.Lock()
	if existing := c.subscriptions[req.ID]; existing != nil {
		existing.close()
	}
	c.subscriptions[req.ID] = &subscriptionHandle{
		conn: conn,
	}
	c.subMutex.Unlock()

	protocol := conn.Subprotocol()
	if protocol == "" {
		protocol = "graphql-transport-ws"
	}

	if err := conn.WriteJSON(map[string]any{
		"type": "connection_init",
	}); err != nil {
		c.removeSubscription(req.ID, conn)
		return err
	}

	go c.runSubscription(req, conn, protocol)
	return nil
}

func (c *CallAPIService) StopSubscription(id string) error {
	c.subMutex.Lock()
	handle := c.subscriptions[id]
	delete(c.subscriptions, id)
	c.subMutex.Unlock()

	if handle == nil {
		return nil
	}

	if handle.conn != nil {
		_ = handle.conn.WriteJSON(map[string]any{
			"id":   id,
			"type": "complete",
		})
	}

	handle.close()
	return nil
}

func (h *subscriptionHandle) close() {
	if h.cancel != nil {
		h.cancel()
	}
	if h.conn != nil {
		_ = h.conn.Close()
	}
}

func (c *CallAPIService) startSSESubscription(req SubscriptionRequest) error {
	ctx, cancel := context.WithCancel(context.Background())
	request, err := c.newSSERequest(ctx, req)
	if err != nil {
		cancel()
		return err
	}

	response, err := c.client.Do(request)
	if err != nil {
		cancel()
		return fmt.Errorf("cannot connect subscription SSE: %w", err)
	}

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(response.Body)
		_ = response.Body.Close()
		cancel()
		return fmt.Errorf("subscription SSE failed: %s %s", response.Status, string(body))
	}

	c.rememberCookies(response.Request.URL, response.Cookies())

	c.subMutex.Lock()
	if existing := c.subscriptions[req.ID]; existing != nil {
		existing.close()
	}
	c.subscriptions[req.ID] = &subscriptionHandle{
		cancel: cancel,
	}
	c.subMutex.Unlock()

	go c.runSSESubscription(req.ID, response, cancel)
	return nil
}

func (c *CallAPIService) newSSERequest(ctx context.Context, req SubscriptionRequest) (*http.Request, error) {
	parsedURL, err := url.Parse(strings.TrimSpace(req.URL))
	if err != nil {
		return nil, err
	}

	query := parsedURL.Query()
	query.Set("query", req.Query)
	if len(req.Variables) > 0 {
		variablesData, err := json.Marshal(req.Variables)
		if err != nil {
			return nil, err
		}
		query.Set("variables", string(variablesData))
	}
	parsedURL.RawQuery = query.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsedURL.String(), nil)
	if err != nil {
		return nil, err
	}

	for key, value := range req.Headers {
		if strings.EqualFold(key, "content-type") || strings.EqualFold(key, "accept") {
			continue
		}
		request.Header.Set(key, value)
	}
	request.Header.Set("Accept", "text/event-stream")
	return request, nil
}

func (c *CallAPIService) runSSESubscription(id string, response *http.Response, cancel context.CancelFunc) {
	defer func() {
		_ = response.Body.Close()
		cancel()
		c.removeSSESubscription(id)
		c.emitSubscriptionEvent(SubscriptionEvent{
			ID:   id,
			Type: "complete",
		})
	}()

	c.emitSubscriptionEvent(SubscriptionEvent{
		ID:   id,
		Type: "connected",
	})

	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	eventType := "next"
	dataLines := []string{}

	flush := func() bool {
		if len(dataLines) == 0 {
			eventType = "next"
			return true
		}

		payload := strings.Join(dataLines, "\n")
		switch eventType {
		case "next", "data", "message", "":
			c.emitSubscriptionEvent(SubscriptionEvent{
				ID:      id,
				Type:    "next",
				Payload: payload,
			})
		case "error":
			c.emitSubscriptionEvent(SubscriptionEvent{
				ID:      id,
				Type:    "error",
				Payload: payload,
				Error:   payload,
			})
		case "complete":
			return false
		}

		eventType = "next"
		dataLines = []string{}
		return true
	}

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			if !flush() {
				return
			}
			continue
		}
		if strings.HasPrefix(line, ":") {
			continue
		}
		if value, ok := strings.CutPrefix(line, "event:"); ok {
			eventType = strings.TrimSpace(value)
			continue
		}
		if value, ok := strings.CutPrefix(line, "data:"); ok {
			dataLines = append(dataLines, strings.TrimSpace(value))
		}
	}

	if len(dataLines) > 0 {
		_ = flush()
	}

	if err := scanner.Err(); err != nil && c.subscriptionIsActive(id, nil) {
		c.emitSubscriptionEvent(SubscriptionEvent{
			ID:    id,
			Type:  "error",
			Error: err.Error(),
		})
	}
}

func (c *CallAPIService) runSubscription(req SubscriptionRequest, conn *websocket.Conn, protocol string) {
	defer func() {
		c.removeSubscription(req.ID, conn)
		c.emitSubscriptionEvent(SubscriptionEvent{
			ID:   req.ID,
			Type: "complete",
		})
	}()

	if err := c.waitForSubscriptionAck(conn); err != nil {
		c.emitSubscriptionEvent(SubscriptionEvent{
			ID:    req.ID,
			Type:  "error",
			Error: err.Error(),
		})
		return
	}

	startType := "subscribe"
	if protocol == "graphql-ws" {
		startType = "start"
	}

	if err := conn.WriteJSON(map[string]any{
		"id":   req.ID,
		"type": startType,
		"payload": map[string]any{
			"query":     req.Query,
			"variables": req.Variables,
		},
	}); err != nil {
		c.emitSubscriptionEvent(SubscriptionEvent{
			ID:    req.ID,
			Type:  "error",
			Error: err.Error(),
		})
		return
	}

	c.emitSubscriptionEvent(SubscriptionEvent{
		ID:   req.ID,
		Type: "connected",
	})

	for {
		var message map[string]any
		if err := conn.ReadJSON(&message); err != nil {
			if !c.subscriptionIsActive(req.ID, conn) {
				return
			}
			c.emitSubscriptionEvent(SubscriptionEvent{
				ID:    req.ID,
				Type:  "error",
				Error: err.Error(),
			})
			return
		}

		messageType, _ := message["type"].(string)
		switch messageType {
		case "next", "data":
			payloadData, _ := json.MarshalIndent(message["payload"], "", "  ")
			c.emitSubscriptionEvent(SubscriptionEvent{
				ID:      req.ID,
				Type:    "next",
				Payload: string(payloadData),
			})
		case "error":
			payloadData, _ := json.MarshalIndent(message["payload"], "", "  ")
			c.emitSubscriptionEvent(SubscriptionEvent{
				ID:      req.ID,
				Type:    "error",
				Payload: string(payloadData),
				Error:   string(payloadData),
			})
		case "complete":
			return
		}
	}
}

func (c *CallAPIService) waitForSubscriptionAck(conn *websocket.Conn) error {
	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	defer conn.SetReadDeadline(time.Time{})

	for {
		var message map[string]any
		if err := conn.ReadJSON(&message); err != nil {
			return err
		}

		messageType, _ := message["type"].(string)
		if messageType == "connection_ack" {
			return nil
		}
		if messageType == "connection_error" || messageType == "error" {
			payload, _ := json.Marshal(message["payload"])
			return fmt.Errorf("subscription connection rejected: %s", string(payload))
		}
	}
}

func (c *CallAPIService) removeSubscription(id string, conn *websocket.Conn) {
	c.subMutex.Lock()
	if handle := c.subscriptions[id]; handle != nil && handle.conn == conn {
		delete(c.subscriptions, id)
	}
	c.subMutex.Unlock()
	_ = conn.Close()
}

func (c *CallAPIService) subscriptionIsActive(id string, conn *websocket.Conn) bool {
	c.subMutex.Lock()
	defer c.subMutex.Unlock()
	handle := c.subscriptions[id]
	if handle == nil {
		return false
	}
	if conn == nil {
		return true
	}
	return handle.conn == conn
}

func (c *CallAPIService) removeSSESubscription(id string) {
	c.subMutex.Lock()
	if handle := c.subscriptions[id]; handle != nil && handle.cancel != nil {
		delete(c.subscriptions, id)
	}
	c.subMutex.Unlock()
}

func (c *CallAPIService) emitSubscriptionEvent(event SubscriptionEvent) {
	if c.ctx == nil {
		return
	}
	runtime.EventsEmit(c.ctx, "graphql-subscription-event", event)
}

func toWebSocketURL(rawURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return "", err
	}

	switch parsed.Scheme {
	case "http":
		parsed.Scheme = "ws"
	case "https":
		parsed.Scheme = "wss"
	case "ws", "wss":
	default:
		return "", fmt.Errorf("unsupported subscription URL scheme: %s", parsed.Scheme)
	}

	return parsed.String(), nil
}

// Pretty-print JSON body nếu có thể
func (c *CallAPIService) FormatJSON(raw string) string {
	var obj interface{}
	if err := json.Unmarshal([]byte(raw), &obj); err != nil {
		return raw // Không phải JSON, trả nguyên bản
	}
	pretty, err := json.MarshalIndent(obj, "", "  ")
	if err != nil {
		return raw
	}
	return string(pretty)
}
