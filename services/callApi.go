package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type CallAPIService struct {
	client *http.Client
}

type APIRequest struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
}

type APIResponse struct {
	StatusCode int               `json:"statusCode"`
	Status     string            `json:"status"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	Duration   int64             `json:"duration"` // milliseconds
	Error      string            `json:"error,omitempty"`
}

func NewCallAPIService() *CallAPIService {
	return &CallAPIService{
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *CallAPIService) SendRequest(req APIRequest) APIResponse {
	start := time.Now()

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

	// Thực hiện request
	resp, err := c.client.Do(httpReq)
	if err != nil {
		return APIResponse{Error: fmt.Sprintf("Không thể kết nối: %s", err.Error())}
	}
	defer resp.Body.Close()

	duration := time.Since(start).Milliseconds()

	// Đọc response body
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return APIResponse{Error: fmt.Sprintf("Không thể đọc response: %s", err.Error())}
	}

	// Thu thập response headers
	respHeaders := make(map[string]string)
	for key, values := range resp.Header {
		respHeaders[key] = values[0]
	}

	return APIResponse{
		StatusCode: resp.StatusCode,
		Status:     resp.Status,
		Headers:    respHeaders,
		Body:       string(respBody),
		Duration:   duration,
	}
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