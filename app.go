package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net"
	"net/http"
	"net/textproto"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/pkg/browser"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/drive/v3"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/option"
)

// App struct4
type App struct {
	ctx       context.Context
	configDir string // Đường dẫn thư mục lưu cấu hình cấu trúc theo từng OS
}

// Struct cấu trúc dữ liệu của Tool GraphQL cần lưu trữ
type GraphQLRequest struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Endpoint  string `json:"endpoint"`
	Query     string `json:"query"`
	Variables string `json:"variables"`
	Timestamp int64  `json:"timestamp"`
}

type AppState struct {
	Theme        string           `json:"theme"`
	LastEndpoint string           `json:"lastEndpoint"`
	History      []GraphQLRequest `json:"history"`
}

type SavedAPI struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Collection string `json:"collection"`
	Folder     string `json:"folder"`
	Endpoint   string `json:"endpoint"`
	Query      string `json:"query"`
	Variables  string `json:"variables"`
	Headers    string `json:"headers"`
	UpdatedAt  int64  `json:"updatedAt"`
}

type SavedAPIStore struct {
	APIs        []SavedAPI        `json:"apis"`
	Collections []SavedCollection `json:"collections"`
}

type Workspace struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

type WorkspaceStore struct {
	ActiveWorkspaceID string      `json:"activeWorkspaceId"`
	Workspaces        []Workspace `json:"workspaces"`
}

type CloudSyncState struct {
	Status       string `json:"status"`
	Message      string `json:"message"`
	UpdatedAt    int64  `json:"updatedAt"`
	LocalVersion int64  `json:"localVersion"`
	CloudVersion int64  `json:"cloudVersion"`
}

type GoogleDriveConfig struct {
	ClientID      string
	ClientSecret  string
	RedirectPort  int
	LockTTLSecond int64
	AccountEmail  string
}

type GoogleDriveConfigRequest struct {
	ClientID      string `json:"clientId"`
	ClientSecret  string `json:"clientSecret"`
	RedirectPort  int    `json:"redirectPort"`
	LockTTLSecond int64  `json:"lockTTLSecond"`
	AccountEmail  string `json:"accountEmail"`
}

type GoogleDriveConfigView struct {
	ClientID        string `json:"clientId"`
	ClientSecretSet bool   `json:"clientSecretSet"`
	RedirectPort    int    `json:"redirectPort"`
	LockTTLSecond   int64  `json:"lockTTLSecond"`
	AccountEmail    string `json:"accountEmail"`
}

type GoogleAccountProfile struct {
	Email string `json:"email"`
}

type EnvironmentVariable struct {
	ID    string `json:"id"`
	Key   string `json:"key"`
	Value string `json:"value"`
}

type EnvironmentItem struct {
	ID        string                `json:"id"`
	Name      string                `json:"name"`
	Variables []EnvironmentVariable `json:"variables"`
}

type EnvironmentStore struct {
	ActiveEnvironmentID string            `json:"activeEnvironmentId"`
	Environments        []EnvironmentItem `json:"environments"`
}

type JSONFileResult struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type BugReportRequest struct {
	Title       string                `json:"title"`
	Description string                `json:"description"`
	DeviceOS    string                `json:"deviceOs"`
	Tags        []string              `json:"tags"`
	Attachments []BugReportAttachment `json:"attachments"`
}

type BugReportAttachment struct {
	Path        string `json:"path"`
	Name        string `json:"name"`
	Size        int64  `json:"size"`
	ContentType string `json:"contentType"`
}

type CloudBackupWorkspace struct {
	Workspace   Workspace         `json:"workspace"`
	Collections []SavedCollection `json:"collections"`
	APIs        []SavedAPI        `json:"apis"`
}

type CloudBackupPayload struct {
	Version           int64                  `json:"version"`
	SyncedAt          int64                  `json:"syncedAt"`
	ActiveWorkspaceID string                 `json:"activeWorkspaceId"`
	Workspaces        []CloudBackupWorkspace `json:"workspaces"`
}

type CloudSyncLock struct {
	LockID    string `json:"lockId"`
	DeviceID  string `json:"deviceId"`
	StartedAt int64  `json:"startedAt"`
	ExpiresAt int64  `json:"expiresAt"`
	Version   int64  `json:"version"`
}

type SavedCollection struct {
	Name    string        `json:"name"`
	Folders []SavedFolder `json:"folders"`
}

type SavedFolder struct {
	Name    string        `json:"name"`
	Folders []SavedFolder `json:"folders"`
}

type SavedFolderRequest struct {
	Collection string `json:"collection"`
	ParentPath string `json:"parentPath"`
	Name       string `json:"name"`
}

type RenameCollectionRequest struct {
	OldName string `json:"oldName"`
	NewName string `json:"newName"`
}

type FolderPathRequest struct {
	Collection string `json:"collection"`
	FolderPath string `json:"folderPath"`
}

type RenameFolderRequest struct {
	Collection string `json:"collection"`
	FolderPath string `json:"folderPath"`
	NewName    string `json:"newName"`
}

type MoveFolderRequest struct {
	SrcCollection  string `json:"srcCollection"`
	SrcPath        string `json:"srcPath"`
	DestCollection string `json:"destCollection"`
	DestPath       string `json:"destPath"`
	DropPosition   string `json:"dropPosition"`
}

type CopySavedAPIRequest struct {
	ID         string `json:"id"`
	Collection string `json:"collection"`
	Folder     string `json:"folder"`
	Name       string `json:"name"`
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

func loadDotEnvFile(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}

	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}

		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		value = strings.Trim(value, `"'`)
		if key == "" || os.Getenv(key) != "" {
			continue
		}

		_ = os.Setenv(key, value)
	}
}

// Hàm startup chạy tự động khi ứng dụng Wails được bật lên
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	loadDotEnvFile(".env")

	// Lấy đường dẫn thư mục Cấu hình chuẩn của OS (Windows: AppData, Linux: .config, Mac: Application Support)
	userConfig, err := os.UserConfigDir()
	if err != nil {
		userConfig = "." // Dự phòng lưu tại thư mục thực thi nếu OS lỗi
	}

	// Tạo thư mục riêng cho Tool của bạn
	a.configDir = filepath.Join(userConfig, "wails-graphql-tool")
	_ = os.MkdirAll(a.configDir, os.ModePerm) // Tự động tạo thư mục nếu chưa có
}

// React sẽ gọi hàm này qua chuỗi JSON gửi xuống
func (a *App) SaveState(stateJson string) string {
	filePath := filepath.Join(a.configDir, "state.json")
	err := os.WriteFile(filePath, []byte(stateJson), 0644)
	if err != nil {
		return err.Error()
	}
	return "SUCCESS"
}

func (a *App) environmentStorePath() string {
	_ = os.MkdirAll(a.configDir, os.ModePerm)
	return filepath.Join(a.configDir, "environments.json")
}

func sanitizeEnvironmentStore(store EnvironmentStore) EnvironmentStore {
	if store.Environments == nil {
		store.Environments = []EnvironmentItem{}
	}

	for index := range store.Environments {
		store.Environments[index].Name = strings.TrimSpace(store.Environments[index].Name)
		if store.Environments[index].Name == "" {
			store.Environments[index].Name = "New Environment"
		}
		if store.Environments[index].Variables == nil {
			store.Environments[index].Variables = []EnvironmentVariable{}
		}
	}

	if store.ActiveEnvironmentID != "" {
		found := false
		for _, environment := range store.Environments {
			if environment.ID == store.ActiveEnvironmentID {
				found = true
				break
			}
		}
		if !found {
			store.ActiveEnvironmentID = ""
		}
	}

	return store
}

func (a *App) LoadEnvironmentStore() (EnvironmentStore, error) {
	filePath := a.environmentStorePath()
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return EnvironmentStore{
			ActiveEnvironmentID: "",
			Environments:        []EnvironmentItem{},
		}, nil
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return EnvironmentStore{}, err
	}

	var store EnvironmentStore
	if len(data) > 0 {
		if err := json.Unmarshal(data, &store); err != nil {
			return EnvironmentStore{}, err
		}
	}

	return sanitizeEnvironmentStore(store), nil
}

func (a *App) SaveEnvironmentStore(store EnvironmentStore) error {
	store = sanitizeEnvironmentStore(store)
	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(a.environmentStorePath(), data, 0600)
}

func jsonFileFilters() []runtime.FileFilter {
	return []runtime.FileFilter{
		{
			DisplayName: "JSON Files (*.json)",
			Pattern:     "*.json",
		},
	}
}

func bugReportAttachmentFilters() []runtime.FileFilter {
	return []runtime.FileFilter{
		{
			DisplayName: "Images and videos",
			Pattern:     "*.png;*.jpg;*.jpeg;*.gif;*.webp;*.mp4;*.mov;*.webm",
		},
		{
			DisplayName: "Images",
			Pattern:     "*.png;*.jpg;*.jpeg;*.gif;*.webp",
		},
		{
			DisplayName: "Videos",
			Pattern:     "*.mp4;*.mov;*.webm",
		},
	}
}

func bugReportAttachmentContentType(path string) string {
	contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(path)))
	if contentType != "" {
		return contentType
	}

	switch strings.ToLower(filepath.Ext(path)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".mp4":
		return "video/mp4"
	case ".mov":
		return "video/quicktime"
	case ".webm":
		return "video/webm"
	default:
		return "application/octet-stream"
	}
}

func validateBugReportAttachment(attachment BugReportAttachment) error {
	if strings.TrimSpace(attachment.Path) == "" {
		return fmt.Errorf("attachment path is required")
	}

	stat, err := os.Stat(attachment.Path)
	if err != nil {
		return fmt.Errorf("cannot read attachment: %w", err)
	}
	if stat.IsDir() {
		return fmt.Errorf("attachment must be a file")
	}
	if stat.Size() > 10*1024*1024 {
		return fmt.Errorf("attachment %s is larger than 10MB", stat.Name())
	}

	contentType := bugReportAttachmentContentType(attachment.Path)
	if !strings.HasPrefix(contentType, "image/") && !strings.HasPrefix(contentType, "video/") {
		return fmt.Errorf("attachment %s must be an image or video", stat.Name())
	}

	return nil
}

func (a *App) OpenJSONFile() (JSONFileResult, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   "Import JSON file",
		Filters: jsonFileFilters(),
	})
	if err != nil {
		return JSONFileResult{}, err
	}
	if path == "" {
		return JSONFileResult{}, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return JSONFileResult{}, err
	}

	return JSONFileResult{
		Path:    path,
		Content: string(data),
	}, nil
}

func (a *App) OpenBugReportAttachmentFile() (BugReportAttachment, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   "Attach image or video",
		Filters: bugReportAttachmentFilters(),
	})
	if err != nil {
		return BugReportAttachment{}, err
	}
	if path == "" {
		return BugReportAttachment{}, nil
	}

	stat, err := os.Stat(path)
	if err != nil {
		return BugReportAttachment{}, err
	}

	attachment := BugReportAttachment{
		Path:        path,
		Name:        stat.Name(),
		Size:        stat.Size(),
		ContentType: bugReportAttachmentContentType(path),
	}
	if err := validateBugReportAttachment(attachment); err != nil {
		return BugReportAttachment{}, err
	}

	return attachment, nil
}

func (a *App) SaveJSONFile(defaultFilename string, content string) (string, error) {
	defaultFilename = strings.TrimSpace(defaultFilename)
	if defaultFilename == "" {
		defaultFilename = "graph-space-export.json"
	}

	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export JSON file",
		DefaultFilename: defaultFilename,
		Filters:         jsonFileFilters(),
	})
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil
	}

	if filepath.Ext(path) == "" {
		path += ".json"
	}

	return path, os.WriteFile(path, []byte(content), 0644)
}

func truncateDiscordThreadName(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "Bug report"
	}
	runes := []rune(value)
	if len(runes) > 90 {
		return string(runes[:90])
	}
	return value
}

func writeDiscordWebhookMultipartFile(writer *multipart.Writer, fieldName string, attachment BugReportAttachment) error {
	file, err := os.Open(attachment.Path)
	if err != nil {
		return err
	}
	defer file.Close()

	partHeader := make(textproto.MIMEHeader)
	partHeader.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, fieldName, strings.ReplaceAll(attachment.Name, `"`, `\"`)))
	partHeader.Set("Content-Type", attachment.ContentType)

	part, err := writer.CreatePart(partHeader)
	if err != nil {
		return err
	}

	_, err = io.Copy(part, file)
	return err
}

func (a *App) SubmitBugReport(req BugReportRequest) error {
	webhookURL := strings.TrimSpace(os.Getenv("DISCORD_BUG_REPORT_WEBHOOK_URL"))
	if webhookURL == "" {
		return fmt.Errorf("Discord bug report webhook is not configured")
	}

	title := strings.TrimSpace(req.Title)
	description := strings.TrimSpace(req.Description)
	deviceOS := strings.TrimSpace(req.DeviceOS)
	if title == "" {
		return fmt.Errorf("title is required")
	}
	if description == "" {
		return fmt.Errorf("bug description is required")
	}
	if len([]rune(title)) > 100 {
		return fmt.Errorf("title must be 100 characters or fewer")
	}
	if len([]rune(description)) > 2000 {
		return fmt.Errorf("bug description must be 2000 characters or fewer")
	}
	if len([]rune(deviceOS)) > 100 {
		return fmt.Errorf("device / os must be 100 characters or fewer")
	}
	if deviceOS == "" {
		deviceOS = "Unknown"
	}

	allowedTags := map[string]bool{
		"1508684326659690566": true,
		"1508684372025413663": true,
		"1508684518586974258": true,
	}
	tags := []string{}
	for _, tag := range req.Tags {
		tag = strings.TrimSpace(tag)
		if !allowedTags[tag] {
			continue
		}
		tags = append(tags, tag)
	}
	if len(req.Attachments) > 3 {
		return fmt.Errorf("bug report supports up to 3 attachments")
	}
	for _, attachment := range req.Attachments {
		if err := validateBugReportAttachment(attachment); err != nil {
			return err
		}
	}

	payload := map[string]any{
		"username":     "Graph Space Bug Reporter",
		"thread_name":  truncateDiscordThreadName(title),
		"applied_tags": tags,
		"embeds": []map[string]any{
			{
				"title":       title,
				"description": description,
				"color":       15158332,
				"fields": []map[string]any{
					{
						"name":   "Device / OS",
						"value":  deviceOS,
						"inline": false,
					},
				},
				"timestamp": time.Now().UTC().Format(time.RFC3339),
			},
		},
		"allowed_mentions": map[string]any{
			"parse": []string{},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	var requestBody *bytes.Reader
	contentType := "application/json"
	if len(req.Attachments) == 0 {
		requestBody = bytes.NewReader(body)
	} else {
		var multipartBody bytes.Buffer
		writer := multipart.NewWriter(&multipartBody)
		if err := writer.WriteField("payload_json", string(body)); err != nil {
			return err
		}
		for index, attachment := range req.Attachments {
			if err := writeDiscordWebhookMultipartFile(writer, fmt.Sprintf("files[%d]", index), attachment); err != nil {
				return fmt.Errorf("cannot attach %s: %w", attachment.Name, err)
			}
		}
		if err := writer.Close(); err != nil {
			return err
		}
		contentType = writer.FormDataContentType()
		requestBody = bytes.NewReader(multipartBody.Bytes())
	}

	request, err := http.NewRequestWithContext(context.Background(), http.MethodPost, webhookURL+"?wait=true", requestBody)
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", contentType)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return fmt.Errorf("cannot send bug report: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		responseBody, _ := io.ReadAll(response.Body)
		return fmt.Errorf("Discord webhook failed: %s %s", response.Status, strings.TrimSpace(string(responseBody)))
	}

	return nil
}

func makeWorkspaceID(name string) string {
	slug := strings.ToLower(strings.TrimSpace(name))
	slug = strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' {
			return r
		}
		if r >= '0' && r <= '9' {
			return r
		}
		if r == '-' || r == '_' {
			return r
		}
		if r == ' ' || r == '/' || r == '\\' {
			return '-'
		}
		return -1
	}, slug)

	slug = strings.Trim(slug, "-")
	if slug == "" {
		slug = "workspace"
	}

	return slug
}

func normalizedNameKey(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func sameName(left string, right string) bool {
	return normalizedNameKey(left) == normalizedNameKey(right)
}

func (a *App) workspaceStorePath() string {
	_ = os.MkdirAll(a.configDir, os.ModePerm)
	return filepath.Join(a.configDir, "workspaces.json")
}

func (a *App) workspaceDataDir(id string) string {
	if id == "" || id == "default" {
		return filepath.Join(a.configDir, "collections")
	}
	return filepath.Join(a.configDir, "workspaces", id)
}

func defaultWorkspace() Workspace {
	now := time.Now().UnixMilli()
	return Workspace{
		ID:        "default",
		Name:      "My Workspace",
		CreatedAt: now,
		UpdatedAt: now,
	}
}

func (a *App) readWorkspaceStore() (WorkspaceStore, error) {
	filePath := a.workspaceStorePath()
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		workspace := defaultWorkspace()
		store := WorkspaceStore{
			ActiveWorkspaceID: workspace.ID,
			Workspaces: []Workspace{
				workspace,
			},
		}
		_ = a.writeWorkspaceStore(store)
		return store, nil
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return WorkspaceStore{}, err
	}

	var store WorkspaceStore
	if len(data) > 0 {
		if err := json.Unmarshal(data, &store); err != nil {
			return WorkspaceStore{}, err
		}
	}

	if len(store.Workspaces) == 0 {
		workspace := defaultWorkspace()
		store.Workspaces = []Workspace{workspace}
		store.ActiveWorkspaceID = workspace.ID
	}

	if store.ActiveWorkspaceID == "" {
		store.ActiveWorkspaceID = store.Workspaces[0].ID
	}

	return store, nil
}

func (a *App) writeWorkspaceStore(store WorkspaceStore) error {
	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(a.workspaceStorePath(), data, 0644)
}

func (a *App) activeWorkspaceID() string {
	store, err := a.readWorkspaceStore()
	if err != nil || store.ActiveWorkspaceID == "" {
		return "default"
	}
	return store.ActiveWorkspaceID
}

func (a *App) savedAPIStorePath() string {
	return a.savedAPIStorePathForWorkspace(a.activeWorkspaceID())
}

func (a *App) savedAPIStorePathForWorkspace(workspaceID string) string {
	if workspaceID == "" || workspaceID == "default" {
		collectionsDir := filepath.Join(a.configDir, "collections")
		_ = os.MkdirAll(collectionsDir, os.ModePerm)
		return filepath.Join(collectionsDir, "apis.json")
	}

	collectionsDir := filepath.Join(a.configDir, "workspaces", workspaceID, "collections")
	_ = os.MkdirAll(collectionsDir, os.ModePerm)
	return filepath.Join(collectionsDir, "apis.json")
}

func (a *App) readSavedAPIStore() (SavedAPIStore, error) {
	return a.readSavedAPIStoreForWorkspace(a.activeWorkspaceID())
}

func (a *App) readSavedAPIStoreForWorkspace(workspaceID string) (SavedAPIStore, error) {
	filePath := a.savedAPIStorePathForWorkspace(workspaceID)
	var store SavedAPIStore

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return SavedAPIStore{
			APIs:        []SavedAPI{},
			Collections: []SavedCollection{},
		}, nil
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return store, err
	}

	if len(data) == 0 {
		return SavedAPIStore{
			APIs:        []SavedAPI{},
			Collections: []SavedCollection{},
		}, nil
	}

	if err := json.Unmarshal(data, &store); err != nil {
		return store, err
	}

	if store.APIs == nil {
		store.APIs = []SavedAPI{}
	}
	if store.Collections == nil {
		store.Collections = []SavedCollection{}
	}

	return store, nil
}

func (a *App) writeSavedAPIStore(store SavedAPIStore) error {
	return a.writeSavedAPIStoreForWorkspace(a.activeWorkspaceID(), store, true)
}

func (a *App) writeSavedAPIStoreForWorkspace(workspaceID string, store SavedAPIStore, markChanged bool) error {
	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}

	if err := os.WriteFile(a.savedAPIStorePathForWorkspace(workspaceID), data, 0644); err != nil {
		return err
	}
	if markChanged {
		a.markWorkspaceDataChanged()
	}
	return nil
}

func (a *App) ListWorkspaces() ([]Workspace, error) {
	store, err := a.readWorkspaceStore()
	if err != nil {
		return []Workspace{}, err
	}

	return store.Workspaces, nil
}

func (a *App) GetActiveWorkspace() (Workspace, error) {
	store, err := a.readWorkspaceStore()
	if err != nil {
		return Workspace{}, err
	}

	for _, workspace := range store.Workspaces {
		if workspace.ID == store.ActiveWorkspaceID {
			return workspace, nil
		}
	}

	if len(store.Workspaces) == 0 {
		return Workspace{}, fmt.Errorf("workspace not found")
	}

	return store.Workspaces[0], nil
}

func (a *App) CreateWorkspace(name string) (Workspace, error) {
	value := strings.TrimSpace(name)
	if value == "" {
		return Workspace{}, fmt.Errorf("workspace name is required")
	}

	store, err := a.readWorkspaceStore()
	if err != nil {
		return Workspace{}, err
	}
	for _, workspace := range store.Workspaces {
		if sameName(workspace.Name, value) {
			return Workspace{}, fmt.Errorf("workspace name already exists")
		}
	}

	baseID := makeWorkspaceID(value)
	nextID := baseID
	index := 2
	for {
		exists := false
		for _, workspace := range store.Workspaces {
			if workspace.ID == nextID {
				exists = true
				break
			}
		}
		if !exists {
			break
		}
		nextID = fmt.Sprintf("%s-%d", baseID, index)
		index++
	}

	now := time.Now().UnixMilli()
	workspace := Workspace{
		ID:        nextID,
		Name:      value,
		CreatedAt: now,
		UpdatedAt: now,
	}

	store.Workspaces = append(store.Workspaces, workspace)
	store.ActiveWorkspaceID = workspace.ID
	if err := a.writeWorkspaceStore(store); err != nil {
		return Workspace{}, err
	}

	_, _ = a.readSavedAPIStore()
	a.markWorkspaceDataChanged()
	return workspace, nil
}

func (a *App) SwitchWorkspace(id string) (Workspace, error) {
	workspaceID := strings.TrimSpace(id)
	if workspaceID == "" {
		return Workspace{}, fmt.Errorf("workspace id is required")
	}

	store, err := a.readWorkspaceStore()
	if err != nil {
		return Workspace{}, err
	}

	for index, workspace := range store.Workspaces {
		if workspace.ID == workspaceID {
			store.ActiveWorkspaceID = workspaceID
			store.Workspaces[index].UpdatedAt = time.Now().UnixMilli()
			if err := a.writeWorkspaceStore(store); err != nil {
				return Workspace{}, err
			}
			return store.Workspaces[index], nil
		}
	}

	return Workspace{}, fmt.Errorf("workspace not found")
}

func (a *App) DeleteWorkspace(id string) (Workspace, error) {
	workspaceID := strings.TrimSpace(id)
	if workspaceID == "" {
		return Workspace{}, fmt.Errorf("workspace id is required")
	}

	store, err := a.readWorkspaceStore()
	if err != nil {
		return Workspace{}, err
	}

	if len(store.Workspaces) <= 1 {
		return Workspace{}, fmt.Errorf("cannot delete the last workspace")
	}

	nextWorkspaces := []Workspace{}
	found := false
	for _, workspace := range store.Workspaces {
		if workspace.ID == workspaceID {
			found = true
			continue
		}
		nextWorkspaces = append(nextWorkspaces, workspace)
	}

	if !found {
		return Workspace{}, fmt.Errorf("workspace not found")
	}

	store.Workspaces = nextWorkspaces
	if store.ActiveWorkspaceID == workspaceID {
		store.ActiveWorkspaceID = store.Workspaces[0].ID
	}

	// Best-effort cleanup of workspace directory. Do not fail the whole deletion if this fails.
	_ = os.RemoveAll(a.workspaceDataDir(workspaceID))

	if err := a.writeWorkspaceStore(store); err != nil {
		return Workspace{}, err
	}

	a.markWorkspaceDataChanged()
	for _, workspace := range store.Workspaces {
		if workspace.ID == store.ActiveWorkspaceID {
			return workspace, nil
		}
	}

	return store.Workspaces[0], nil
}

func (a *App) cloudSyncStatePath() string {
	_ = os.MkdirAll(a.configDir, os.ModePerm)
	return filepath.Join(a.configDir, "cloud-sync.json")
}

func (a *App) GetCloudSyncState() (CloudSyncState, error) {
	filePath := a.cloudSyncStatePath()
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return CloudSyncState{
			Status:       "not_logged_in",
			Message:      "",
			LocalVersion: a.localWorkspaceDataVersion(),
		}, nil
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return CloudSyncState{}, err
	}

	var state CloudSyncState
	if len(data) > 0 {
		if err := json.Unmarshal(data, &state); err != nil {
			return CloudSyncState{}, err
		}
	}

	if state.Status == "" {
		state.Status = "not_logged_in"
	}
	if state.LocalVersion == 0 {
		state.LocalVersion = a.localWorkspaceDataVersion()
	}

	return state, nil
}

func (a *App) writeCloudSyncState(state CloudSyncState) (CloudSyncState, error) {
	state.UpdatedAt = time.Now().UnixMilli()
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return CloudSyncState{}, err
	}

	if err := os.WriteFile(a.cloudSyncStatePath(), data, 0644); err != nil {
		return CloudSyncState{}, err
	}

	return state, nil
}

func (a *App) markWorkspaceDataChanged() {
	state, _ := a.GetCloudSyncState()
	now := time.Now().UnixMilli()
	if now <= state.LocalVersion {
		now = state.LocalVersion + 1
	}
	state.LocalVersion = now
	state.UpdatedAt = now
	if state.Status != "not_logged_in" && state.Status != "error" {
		state.Status = "pending"
		state.Message = "Local collections changed. Sync to Google Drive when ready."
	}
	_, _ = a.writeCloudSyncState(state)
}

func (a *App) localWorkspaceDataVersion() int64 {
	maxVersion := int64(0)
	store, err := a.readWorkspaceStore()
	if err == nil {
		for _, workspace := range store.Workspaces {
			if workspace.UpdatedAt > maxVersion {
				maxVersion = workspace.UpdatedAt
			}
			apiStore, err := a.readSavedAPIStoreForWorkspace(workspace.ID)
			if err != nil {
				continue
			}
			for _, api := range apiStore.APIs {
				if api.UpdatedAt > maxVersion {
					maxVersion = api.UpdatedAt
				}
			}
		}
	}
	if maxVersion == 0 {
		maxVersion = time.Now().UnixMilli()
	}
	return maxVersion
}

func (a *App) googleDriveConfig() (GoogleDriveConfig, error) {
	if config, err := a.readStoredGoogleDriveConfig(); err == nil && config.ClientID != "" && config.ClientSecret != "" {
		return config, nil
	}

	return GoogleDriveConfig{}, fmt.Errorf("Google Drive config is missing. Enter Google Client ID and Client Secret in Cloud Sync settings.")
}

func (a *App) googleDriveConfigPath() string {
	_ = os.MkdirAll(a.configDir, os.ModePerm)
	return filepath.Join(a.configDir, "google-drive-config.json")
}

func (a *App) readStoredGoogleDriveConfig() (GoogleDriveConfig, error) {
	data, err := os.ReadFile(a.googleDriveConfigPath())
	if err != nil {
		return GoogleDriveConfig{}, err
	}

	var config GoogleDriveConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return GoogleDriveConfig{}, err
	}

	if config.RedirectPort <= 0 {
		config.RedirectPort = 53682
	}
	if config.LockTTLSecond <= 0 {
		config.LockTTLSecond = 120
	}

	return config, nil
}

func (a *App) GetGoogleDriveConfig() (GoogleDriveConfigView, error) {
	account, _ := a.readGoogleAccountProfile()
	config, err := a.readStoredGoogleDriveConfig()
	accountEmail := strings.TrimSpace(account.Email)
	if err != nil {
		return GoogleDriveConfigView{
			ClientID:        "",
			ClientSecretSet: false,
			RedirectPort:    53682,
			LockTTLSecond:   120,
			AccountEmail:    accountEmail,
		}, nil
	}
	if strings.TrimSpace(config.AccountEmail) != "" {
		accountEmail = strings.TrimSpace(config.AccountEmail)
	}

	return GoogleDriveConfigView{
		ClientID:        config.ClientID,
		ClientSecretSet: config.ClientSecret != "",
		RedirectPort:    config.RedirectPort,
		LockTTLSecond:   config.LockTTLSecond,
		AccountEmail:    accountEmail,
	}, nil
}

func (a *App) SaveGoogleDriveConfig(req GoogleDriveConfigRequest) (GoogleDriveConfigView, error) {
	existing, _ := a.readStoredGoogleDriveConfig()

	clientID := strings.TrimSpace(req.ClientID)
	clientSecret := strings.TrimSpace(req.ClientSecret)
	if clientSecret == "" {
		clientSecret = existing.ClientSecret
	}

	redirectPort := req.RedirectPort
	if redirectPort <= 0 {
		redirectPort = 53682
	}

	lockTTL := req.LockTTLSecond
	if lockTTL <= 0 {
		lockTTL = 120
	}
	accountEmail := strings.TrimSpace(req.AccountEmail)

	if clientID == "" || clientSecret == "" {
		return GoogleDriveConfigView{}, fmt.Errorf("Google Client ID and Client Secret are required")
	}

	config := GoogleDriveConfig{
		ClientID:      clientID,
		ClientSecret:  clientSecret,
		RedirectPort:  redirectPort,
		LockTTLSecond: lockTTL,
		AccountEmail:  accountEmail,
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return GoogleDriveConfigView{}, err
	}
	if err := os.WriteFile(a.googleDriveConfigPath(), data, 0600); err != nil {
		return GoogleDriveConfigView{}, err
	}

	return GoogleDriveConfigView{
		ClientID:        config.ClientID,
		ClientSecretSet: config.ClientSecret != "",
		RedirectPort:    config.RedirectPort,
		LockTTLSecond:   config.LockTTLSecond,
		AccountEmail:    config.AccountEmail,
	}, nil
}

func (a *App) oauthConfig() (*oauth2.Config, GoogleDriveConfig, error) {
	driveConfig, err := a.googleDriveConfig()
	if err != nil {
		return nil, GoogleDriveConfig{}, err
	}

	return &oauth2.Config{
		ClientID:     driveConfig.ClientID,
		ClientSecret: driveConfig.ClientSecret,
		RedirectURL:  fmt.Sprintf("http://127.0.0.1:%d/oauth/google/callback", driveConfig.RedirectPort),
		Scopes: []string{
			drive.DriveAppdataScope,
			"https://www.googleapis.com/auth/userinfo.email",
		},
		Endpoint: google.Endpoint,
	}, driveConfig, nil
}

func (a *App) googleTokenPath() string {
	_ = os.MkdirAll(a.configDir, os.ModePerm)
	return filepath.Join(a.configDir, "google-token.json")
}

func (a *App) readGoogleToken() (*oauth2.Token, error) {
	data, err := os.ReadFile(a.googleTokenPath())
	if err != nil {
		return nil, err
	}

	var token oauth2.Token
	if err := json.Unmarshal(data, &token); err != nil {
		return nil, err
	}

	return &token, nil
}

func (a *App) writeGoogleToken(token *oauth2.Token) error {
	data, err := json.MarshalIndent(token, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(a.googleTokenPath(), data, 0600)
}

func (a *App) googleAccountProfilePath() string {
	_ = os.MkdirAll(a.configDir, os.ModePerm)
	return filepath.Join(a.configDir, "google-account.json")
}

func (a *App) readGoogleAccountProfile() (GoogleAccountProfile, error) {
	data, err := os.ReadFile(a.googleAccountProfilePath())
	if err != nil {
		return GoogleAccountProfile{}, err
	}

	var profile GoogleAccountProfile
	if err := json.Unmarshal(data, &profile); err != nil {
		return GoogleAccountProfile{}, err
	}

	return profile, nil
}

func (a *App) writeGoogleAccountProfile(profile GoogleAccountProfile) error {
	data, err := json.MarshalIndent(profile, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(a.googleAccountProfilePath(), data, 0600)
}

func fetchGoogleAccountProfile(ctx context.Context, client *http.Client) (GoogleAccountProfile, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	if err != nil {
		return GoogleAccountProfile{}, err
	}

	response, err := client.Do(request)
	if err != nil {
		return GoogleAccountProfile{}, err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return GoogleAccountProfile{}, fmt.Errorf("cannot read Google account profile: %s", response.Status)
	}

	var profile GoogleAccountProfile
	if err := json.NewDecoder(response.Body).Decode(&profile); err != nil {
		return GoogleAccountProfile{}, err
	}

	return profile, nil
}

func randomState() string {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return fmt.Sprintf("%x", buffer)
}

func (a *App) driveService(ctx context.Context) (*drive.Service, error) {
	oauthConfig, _, err := a.oauthConfig()
	if err != nil {
		return nil, err
	}

	token, err := a.readGoogleToken()
	if err != nil {
		return nil, fmt.Errorf("login to Google Drive before syncing")
	}

	client := oauthConfig.Client(ctx, token)
	return drive.NewService(ctx, option.WithHTTPClient(client))
}

func escapeDriveQueryValue(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `'`, `\'`)
	return value
}

func findAppDataFile(service *drive.Service, name string) (*drive.File, error) {
	query := fmt.Sprintf("name = '%s' and trashed = false", escapeDriveQueryValue(name))
	result, err := service.Files.List().
		Spaces("appDataFolder").
		Q(query).
		Fields("files(id,name,modifiedTime)").
		PageSize(1).
		Do()
	if err != nil {
		return nil, err
	}

	if len(result.Files) == 0 {
		return nil, nil
	}

	return result.Files[0], nil
}

func upsertAppDataFile(service *drive.Service, name string, contentType string, data []byte) error {
	existing, err := findAppDataFile(service, name)
	if err != nil {
		return err
	}

	media := bytes.NewReader(data)
	if existing == nil {
		_, err = service.Files.Create(&drive.File{
			Name:    name,
			Parents: []string{"appDataFolder"},
		}).
			Media(media, googleapi.ContentType(contentType)).
			Fields("id").
			Do()
		return err
	}

	_, err = service.Files.Update(existing.Id, &drive.File{
		Name: name,
	}).
		Media(media, googleapi.ContentType(contentType)).
		Fields("id").
		Do()
	return err
}

func createAppDataFile(service *drive.Service, name string, contentType string, data []byte) (*drive.File, error) {
	return service.Files.Create(&drive.File{
		Name:    name,
		Parents: []string{"appDataFolder"},
	}).
		Media(bytes.NewReader(data), googleapi.ContentType(contentType)).
		Fields("id,name").
		Do()
}

func readAppDataFile(service *drive.Service, name string, target any) (bool, error) {
	existing, err := findAppDataFile(service, name)
	if err != nil {
		return false, err
	}
	if existing == nil {
		return false, nil
	}

	response, err := service.Files.Get(existing.Id).Download()
	if err != nil {
		return false, err
	}
	defer response.Body.Close()

	data, err := io.ReadAll(response.Body)
	if err != nil {
		return false, err
	}

	if err := json.Unmarshal(data, target); err != nil {
		return false, err
	}

	return true, nil
}

func readAppDataFileByID(service *drive.Service, fileID string, target any) error {
	response, err := service.Files.Get(fileID).Download()
	if err != nil {
		return err
	}
	defer response.Body.Close()

	data, err := io.ReadAll(response.Body)
	if err != nil {
		return err
	}

	return json.Unmarshal(data, target)
}

func deleteAppDataFile(service *drive.Service, name string) error {
	existing, err := findAppDataFile(service, name)
	if err != nil || existing == nil {
		return err
	}
	return service.Files.Delete(existing.Id).Do()
}

func deleteAppDataFileByID(service *drive.Service, fileID string) error {
	if fileID == "" {
		return nil
	}
	return service.Files.Delete(fileID).Do()
}

type cloudSyncLockFile struct {
	fileID string
	name   string
	lock   CloudSyncLock
}

func listCloudSyncLockFiles(service *drive.Service) ([]cloudSyncLockFile, error) {
	query := fmt.Sprintf("name contains '%s' and trashed = false", escapeDriveQueryValue("graph-space-sync-lock"))
	result, err := service.Files.List().
		Spaces("appDataFolder").
		Q(query).
		Fields("files(id,name,modifiedTime)").
		PageSize(100).
		Do()
	if err != nil {
		return nil, err
	}

	now := time.Now().UnixMilli()
	locks := []cloudSyncLockFile{}
	for _, file := range result.Files {
		var lock CloudSyncLock
		if err := readAppDataFileByID(service, file.Id, &lock); err != nil {
			continue
		}
		if lock.ExpiresAt <= now {
			_ = deleteAppDataFileByID(service, file.Id)
			continue
		}
		if lock.LockID == "" {
			lock.LockID = file.Id
		}
		locks = append(locks, cloudSyncLockFile{
			fileID: file.Id,
			name:   file.Name,
			lock:   lock,
		})
	}

	sort.Slice(locks, func(i, j int) bool {
		if locks[i].lock.StartedAt == locks[j].lock.StartedAt {
			return locks[i].lock.LockID < locks[j].lock.LockID
		}
		return locks[i].lock.StartedAt < locks[j].lock.StartedAt
	})

	return locks, nil
}

func cloudSyncLockName(lockID string) string {
	return fmt.Sprintf("graph-space-sync-lock-%s.json", lockID)
}

func acquireCloudSyncLock(service *drive.Service, deviceID string, version int64, ttlSecond int64) (func(), error) {
	lockID := randomState()
	now := time.Now().UnixMilli()
	lock := CloudSyncLock{
		LockID:    lockID,
		DeviceID:  deviceID,
		StartedAt: now,
		ExpiresAt: time.Now().Add(time.Duration(ttlSecond) * time.Second).UnixMilli(),
		Version:   version,
	}
	lockData, _ := json.MarshalIndent(lock, "", "  ")
	created, err := createAppDataFile(service, cloudSyncLockName(lockID), "application/json", lockData)
	if err != nil {
		return nil, fmt.Errorf("cannot create sync lock: %w", err)
	}

	release := func() {
		_ = deleteAppDataFileByID(service, created.Id)
	}

	time.Sleep(750 * time.Millisecond)

	locks, err := listCloudSyncLockFiles(service)
	if err != nil {
		release()
		return nil, fmt.Errorf("cannot verify sync lock: %w", err)
	}

	if len(locks) == 0 || locks[0].lock.LockID != lockID {
		release()
		return nil, fmt.Errorf("another device is syncing this Google Drive data. Try again later")
	}

	return release, nil
}

func (a *App) deviceIDPath() string {
	return filepath.Join(a.configDir, "device-id")
}

func (a *App) deviceID() (string, error) {
	if data, err := os.ReadFile(a.deviceIDPath()); err == nil {
		value := strings.TrimSpace(string(data))
		if value != "" {
			return value, nil
		}
	}

	value := randomState()
	if err := os.WriteFile(a.deviceIDPath(), []byte(value), 0600); err != nil {
		return "", err
	}

	return value, nil
}

func (a *App) buildCloudBackupPayload(version int64) (CloudBackupPayload, error) {
	workspaceStore, err := a.readWorkspaceStore()
	if err != nil {
		return CloudBackupPayload{}, err
	}
	if version == 0 {
		version = time.Now().UnixMilli()
	}

	payload := CloudBackupPayload{
		Version:           version,
		SyncedAt:          time.Now().UnixMilli(),
		ActiveWorkspaceID: workspaceStore.ActiveWorkspaceID,
		Workspaces:        []CloudBackupWorkspace{},
	}

	for _, workspace := range workspaceStore.Workspaces {
		store, err := a.readSavedAPIStoreForWorkspace(workspace.ID)
		if err != nil {
			return CloudBackupPayload{}, err
		}

		payload.Workspaces = append(payload.Workspaces, CloudBackupWorkspace{
			Workspace:   workspace,
			Collections: hydrateCollectionsFromAPIs(store.Collections, store.APIs),
			APIs:        store.APIs,
		})
	}

	return payload, nil
}

func (a *App) RequestGoogleDriveAccess() (CloudSyncState, error) {
	oauthConfig, driveConfig, err := a.oauthConfig()
	if err != nil {
		return a.writeCloudSyncState(CloudSyncState{
			Status:  "error",
			Message: err.Error(),
		})
	}

	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", driveConfig.RedirectPort))
	if err != nil {
		return a.writeCloudSyncState(CloudSyncState{
			Status:  "error",
			Message: fmt.Sprintf("cannot start OAuth callback server: %v", err),
		})
	}
	defer listener.Close()

	state := randomState()
	codeChannel := make(chan string, 1)
	errorChannel := make(chan error, 1)
	server := &http.Server{}
	server.Handler = http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/oauth/google/callback" {
			http.NotFound(response, request)
			return
		}

		if request.URL.Query().Get("state") != state {
			errorChannel <- fmt.Errorf("invalid OAuth state")
			http.Error(response, "Invalid OAuth state", http.StatusBadRequest)
			return
		}

		if oauthError := request.URL.Query().Get("error"); oauthError != "" {
			errorChannel <- fmt.Errorf("%s", oauthError)
			http.Error(response, oauthError, http.StatusBadRequest)
			return
		}

		code := request.URL.Query().Get("code")
		if code == "" {
			errorChannel <- fmt.Errorf("missing OAuth code")
			http.Error(response, "Missing OAuth code", http.StatusBadRequest)
			return
		}

		codeChannel <- code
		_, _ = response.Write([]byte("Graph Space Google Drive access granted. You can close this tab."))
	})

	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			errorChannel <- err
		}
	}()
	defer server.Shutdown(context.Background())

	authURL := oauthConfig.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.ApprovalForce)
	if err := browser.OpenURL(authURL); err != nil {
		return a.writeCloudSyncState(CloudSyncState{
			Status:  "error",
			Message: fmt.Sprintf("cannot open browser for Google login: %v", err),
		})
	}

	select {
	case code := <-codeChannel:
		token, err := oauthConfig.Exchange(context.Background(), code)
		if err != nil {
			return a.writeCloudSyncState(CloudSyncState{
				Status:  "error",
				Message: fmt.Sprintf("cannot exchange OAuth code: %v", err),
			})
		}
		if err := a.writeGoogleToken(token); err != nil {
			return a.writeCloudSyncState(CloudSyncState{
				Status:  "error",
				Message: fmt.Sprintf("cannot save Google token: %v", err),
			})
		}
		client := oauthConfig.Client(context.Background(), token)
		if profile, err := fetchGoogleAccountProfile(context.Background(), client); err == nil {
			_ = a.writeGoogleAccountProfile(profile)
		}
		return a.writeCloudSyncState(CloudSyncState{
			Status:  "pending",
			Message: "Google Drive connected. Sync all changed workspaces when ready.",
		})
	case err := <-errorChannel:
		return a.writeCloudSyncState(CloudSyncState{
			Status:  "error",
			Message: err.Error(),
		})
	case <-time.After(2 * time.Minute):
		return a.writeCloudSyncState(CloudSyncState{
			Status:  "error",
			Message: "Google login timed out.",
		})
	}
}

func (a *App) SyncAllWorkspacesToGoogleDrive() (CloudSyncState, error) {
	state, _ := a.writeCloudSyncState(CloudSyncState{
		Status:  "syncing",
		Message: "Syncing all changed workspaces to Google Drive...",
	})

	service, err := a.driveService(context.Background())
	if err != nil {
		return a.writeCloudSyncState(CloudSyncState{
			Status:  "not_logged_in",
			Message: err.Error(),
		})
	}

	driveConfig, err := a.googleDriveConfig()
	if err != nil {
		return a.writeCloudSyncState(CloudSyncState{
			Status:  "error",
			Message: err.Error(),
		})
	}

	deviceID, err := a.deviceID()
	if err != nil {
		return a.writeCloudSyncState(CloudSyncState{
			Status:  "error",
			Message: fmt.Sprintf("cannot read device id: %v", err),
		})
	}

	currentState, _ := a.GetCloudSyncState()
	if currentState.LocalVersion == 0 {
		currentState.LocalVersion = time.Now().UnixMilli()
	}

	releaseLock, err := acquireCloudSyncLock(service, deviceID, currentState.LocalVersion, driveConfig.LockTTLSecond)
	if err != nil {
		return a.writeCloudSyncState(CloudSyncState{
			Status:  "error",
			Message: err.Error(),
		})
	}
	defer releaseLock()

	payload, err := a.buildCloudBackupPayload(currentState.LocalVersion)
	if err != nil {
		return a.writeCloudSyncState(CloudSyncState{
			Status:  "error",
			Message: fmt.Sprintf("cannot build workspace backup: %v", err),
		})
	}

	payloadData, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return a.writeCloudSyncState(CloudSyncState{
			Status:  "error",
			Message: fmt.Sprintf("cannot encode workspace backup: %v", err),
		})
	}

	if err := upsertAppDataFile(service, "graph-space-workspaces.json", "application/json", payloadData); err != nil {
		return a.writeCloudSyncState(CloudSyncState{
			Status:  "error",
			Message: fmt.Sprintf("cannot upload workspace backup: %v", err),
		})
	}

	state, _ = a.writeCloudSyncState(CloudSyncState{
		Status:       "synced",
		Message:      fmt.Sprintf("Synced %d workspaces to Google Drive app data.", len(payload.Workspaces)),
		LocalVersion: payload.Version,
		CloudVersion: payload.Version,
	})
	return state, nil
}

func (a *App) CheckGoogleDriveSyncStatus() (CloudSyncState, error) {
	state, _ := a.GetCloudSyncState()
	service, err := a.driveService(context.Background())
	if err != nil {
		state.Status = "not_logged_in"
		state.Message = err.Error()
		next, _ := a.writeCloudSyncState(state)
		return next, nil
	}

	var payload CloudBackupPayload
	ok, err := readAppDataFile(service, "graph-space-workspaces.json", &payload)
	if err != nil {
		state.Status = "error"
		state.Message = fmt.Sprintf("cannot check Google Drive backup: %v", err)
		next, _ := a.writeCloudSyncState(state)
		return next, nil
	}
	if !ok {
		if state.Status != "pending" {
			state.Status = "pending"
			state.Message = "No Google Drive backup found. Sync local workspaces to create one."
		}
		next, _ := a.writeCloudSyncState(state)
		return next, nil
	}

	if state.LocalVersion == 0 {
		if state.Status == "synced" {
			state.LocalVersion = payload.Version
		} else {
			state.LocalVersion = a.localWorkspaceDataVersion()
		}
	}
	state.CloudVersion = payload.Version

	if payload.Version > state.LocalVersion {
		state.Status = "pull_available"
		state.Message = "Google Drive has a newer workspace backup. Pull it to this device."
	} else if state.LocalVersion > payload.Version {
		state.Status = "pending"
		state.Message = "Local collections changed. Sync to Google Drive when ready."
	} else {
		state.Status = "synced"
		state.Message = "Local workspaces are up to date with Google Drive."
	}

	next, _ := a.writeCloudSyncState(state)
	return next, nil
}

func (a *App) PullWorkspacesFromGoogleDrive() (CloudSyncState, error) {
	state, _ := a.writeCloudSyncState(CloudSyncState{
		Status:  "syncing",
		Message: "Pulling workspace backup from Google Drive...",
	})

	service, err := a.driveService(context.Background())
	if err != nil {
		return a.writeCloudSyncState(CloudSyncState{
			Status:  "not_logged_in",
			Message: err.Error(),
		})
	}

	var payload CloudBackupPayload
	ok, err := readAppDataFile(service, "graph-space-workspaces.json", &payload)
	if err != nil {
		return a.writeCloudSyncState(CloudSyncState{
			Status:  "error",
			Message: fmt.Sprintf("cannot read Google Drive backup: %v", err),
		})
	}
	if !ok {
		return a.writeCloudSyncState(CloudSyncState{
			Status:  "pending",
			Message: "No Google Drive backup found.",
		})
	}

	if err := a.applyCloudBackupPayload(payload); err != nil {
		return a.writeCloudSyncState(CloudSyncState{
			Status:  "error",
			Message: fmt.Sprintf("cannot apply Google Drive backup: %v", err),
		})
	}

	state, _ = a.writeCloudSyncState(CloudSyncState{
		Status:       "synced",
		Message:      fmt.Sprintf("Pulled %d workspaces from Google Drive.", len(payload.Workspaces)),
		LocalVersion: payload.Version,
		CloudVersion: payload.Version,
	})
	return state, nil
}

func (a *App) applyCloudBackupPayload(payload CloudBackupPayload) error {
	workspaces := []Workspace{}
	for _, item := range payload.Workspaces {
		workspaces = append(workspaces, item.Workspace)
	}
	if len(workspaces) == 0 {
		workspace := defaultWorkspace()
		workspaces = []Workspace{workspace}
		payload.ActiveWorkspaceID = workspace.ID
	}

	activeID := payload.ActiveWorkspaceID
	foundActive := false
	for _, workspace := range workspaces {
		if workspace.ID == activeID {
			foundActive = true
			break
		}
	}
	if !foundActive {
		activeID = workspaces[0].ID
	}

	if err := os.RemoveAll(filepath.Join(a.configDir, "collections")); err != nil {
		return err
	}
	if err := os.RemoveAll(filepath.Join(a.configDir, "workspaces")); err != nil {
		return err
	}

	if err := a.writeWorkspaceStore(WorkspaceStore{
		ActiveWorkspaceID: activeID,
		Workspaces:        workspaces,
	}); err != nil {
		return err
	}

	for _, item := range payload.Workspaces {
		store := SavedAPIStore{
			APIs:        item.APIs,
			Collections: item.Collections,
		}
		if err := a.writeSavedAPIStoreForWorkspace(item.Workspace.ID, store, false); err != nil {
			return err
		}
	}

	return nil
}

func makeSavedAPIID(name string) string {
	slug := strings.ToLower(strings.TrimSpace(name))
	slug = strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' {
			return r
		}
		if r >= '0' && r <= '9' {
			return r
		}
		if r == '-' || r == '_' {
			return r
		}
		if r == ' ' || r == '/' || r == '\\' {
			return '-'
		}
		return -1
	}, slug)

	slug = strings.Trim(slug, "-")
	if slug == "" {
		slug = "api"
	}

	return fmt.Sprintf("%s-%d", slug, time.Now().UnixMilli())
}

func (a *App) ListSavedAPIs() ([]SavedAPI, error) {
	store, err := a.readSavedAPIStore()
	if err != nil {
		return []SavedAPI{}, err
	}

	return store.APIs, nil
}

func (a *App) ListSavedCollections() ([]SavedCollection, error) {
	store, err := a.readSavedAPIStore()
	if err != nil {
		return []SavedCollection{}, err
	}

	return hydrateCollectionsFromAPIs(store.Collections, store.APIs), nil
}

func normalizePath(path string) string {
	parts := []string{}
	for _, part := range strings.Split(path, "/") {
		part = strings.TrimSpace(part)
		if part != "" {
			parts = append(parts, part)
		}
	}
	return strings.Join(parts, "/")
}

func ensureFolderPath(folders []SavedFolder, parts []string) []SavedFolder {
	if len(parts) == 0 {
		return folders
	}

	name := parts[0]
	for index := range folders {
		if folders[index].Name == name {
			folders[index].Folders = ensureFolderPath(folders[index].Folders, parts[1:])
			return folders
		}
	}

	next := SavedFolder{
		Name:    name,
		Folders: []SavedFolder{},
	}
	next.Folders = ensureFolderPath(next.Folders, parts[1:])
	return append(folders, next)
}

func renameFolderPath(folders []SavedFolder, parts []string, newName string) []SavedFolder {
	if len(parts) == 0 {
		return folders
	}

	for index := range folders {
		if folders[index].Name != parts[0] {
			continue
		}

		if len(parts) == 1 {
			folders[index].Name = newName
			return folders
		}

		folders[index].Folders = renameFolderPath(folders[index].Folders, parts[1:], newName)
		return folders
	}

	return folders
}

func deleteFolderPath(folders []SavedFolder, parts []string) []SavedFolder {
	if len(parts) == 0 {
		return folders
	}

	next := []SavedFolder{}
	for _, folder := range folders {
		if folder.Name != parts[0] {
			next = append(next, folder)
			continue
		}

		if len(parts) == 1 {
			continue
		}

		folder.Folders = deleteFolderPath(folder.Folders, parts[1:])
		next = append(next, folder)
	}

	return next
}

func collectionNameExists(store SavedAPIStore, name string, exceptName string) bool {
	for _, collection := range store.Collections {
		if exceptName != "" && sameName(collection.Name, exceptName) {
			continue
		}
		if sameName(collection.Name, name) {
			return true
		}
	}
	for _, api := range store.APIs {
		apiCollection := strings.TrimSpace(api.Collection)
		if apiCollection == "" {
			apiCollection = "Default"
		}
		if exceptName != "" && sameName(apiCollection, exceptName) {
			continue
		}
		if sameName(apiCollection, name) {
			return true
		}
	}
	return false
}

func folderChildrenForPath(folders []SavedFolder, parentPath string) []SavedFolder {
	parentPath = normalizePath(parentPath)
	if parentPath == "" {
		return folders
	}

	children := folders
	for _, part := range strings.Split(parentPath, "/") {
		found := false
		for _, folder := range children {
			if sameName(folder.Name, part) {
				children = folder.Folders
				found = true
				break
			}
		}
		if !found {
			return []SavedFolder{}
		}
	}

	return children
}

func folderNameExists(folders []SavedFolder, parentPath string, name string, exceptName string) bool {
	for _, folder := range folderChildrenForPath(folders, parentPath) {
		if exceptName != "" && sameName(folder.Name, exceptName) {
			continue
		}
		if sameName(folder.Name, name) {
			return true
		}
	}
	return false
}

func savedAPINameExists(store SavedAPIStore, name string, collection string, folder string, exceptID string) bool {
	collection = strings.TrimSpace(collection)
	if collection == "" {
		collection = "Default"
	}
	folder = normalizePath(folder)

	for _, api := range store.APIs {
		if exceptID != "" && api.ID == exceptID {
			continue
		}
		apiCollection := strings.TrimSpace(api.Collection)
		if apiCollection == "" {
			apiCollection = "Default"
		}
		if sameName(api.Name, name) && sameName(apiCollection, collection) && normalizePath(api.Folder) == folder {
			return true
		}
	}

	return false
}

func ensureCollection(store *SavedAPIStore, name string) *SavedCollection {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "Default"
	}

	for index := range store.Collections {
		if store.Collections[index].Name == name {
			return &store.Collections[index]
		}
	}

	store.Collections = append(store.Collections, SavedCollection{
		Name:    name,
		Folders: []SavedFolder{},
	})
	return &store.Collections[len(store.Collections)-1]
}

func hydrateCollectionsFromAPIs(collections []SavedCollection, apis []SavedAPI) []SavedCollection {
	store := SavedAPIStore{
		Collections: collections,
	}

	for _, api := range apis {
		collection := ensureCollection(&store, api.Collection)
		folderPath := normalizePath(api.Folder)
		if folderPath != "" {
			collection.Folders = ensureFolderPath(collection.Folders, strings.Split(folderPath, "/"))
		}
	}

	return store.Collections
}

func (a *App) SaveCollection(name string) (SavedCollection, error) {
	store, err := a.readSavedAPIStore()
	if err != nil {
		return SavedCollection{}, err
	}

	name = strings.TrimSpace(name)
	if name == "" {
		return SavedCollection{}, fmt.Errorf("collection name is required")
	}
	if collectionNameExists(store, name, "") {
		return SavedCollection{}, fmt.Errorf("collection name already exists")
	}

	collection := ensureCollection(&store, name)
	if err := a.writeSavedAPIStore(store); err != nil {
		return SavedCollection{}, err
	}

	return *collection, nil
}

func (a *App) SaveFolder(req SavedFolderRequest) (SavedCollection, error) {
	store, err := a.readSavedAPIStore()
	if err != nil {
		return SavedCollection{}, err
	}

	collection := ensureCollection(&store, req.Collection)
	parentPath := normalizePath(req.ParentPath)
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return SavedCollection{}, fmt.Errorf("folder name is required")
	}
	if folderNameExists(collection.Folders, parentPath, name, "") {
		return SavedCollection{}, fmt.Errorf("folder name already exists")
	}

	fullPath := name
	if parentPath != "" {
		fullPath = parentPath + "/" + name
	}

	collection.Folders = ensureFolderPath(collection.Folders, strings.Split(fullPath, "/"))

	if err := a.writeSavedAPIStore(store); err != nil {
		return SavedCollection{}, err
	}

	return *collection, nil
}

func (a *App) RenameCollection(req RenameCollectionRequest) (SavedCollection, error) {
	store, err := a.readSavedAPIStore()
	if err != nil {
		return SavedCollection{}, err
	}

	oldName := strings.TrimSpace(req.OldName)
	newName := strings.TrimSpace(req.NewName)
	if newName == "" {
		return SavedCollection{}, fmt.Errorf("collection name is required")
	}
	if !sameName(oldName, newName) && collectionNameExists(store, newName, oldName) {
		return SavedCollection{}, fmt.Errorf("collection name already exists")
	}

	collection := ensureCollection(&store, oldName)
	collection.Name = newName

	for index := range store.APIs {
		if store.APIs[index].Collection == oldName {
			store.APIs[index].Collection = newName
		}
	}

	if err := a.writeSavedAPIStore(store); err != nil {
		return SavedCollection{}, err
	}

	return *collection, nil
}

func (a *App) DeleteCollection(name string) error {
	store, err := a.readSavedAPIStore()
	if err != nil {
		return err
	}

	name = strings.TrimSpace(name)
	collections := []SavedCollection{}
	for _, collection := range store.Collections {
		if collection.Name != name {
			collections = append(collections, collection)
		}
	}

	apis := []SavedAPI{}
	for _, api := range store.APIs {
		if api.Collection != name {
			apis = append(apis, api)
		}
	}

	store.Collections = collections
	store.APIs = apis
	return a.writeSavedAPIStore(store)
}

func (a *App) RenameFolder(req RenameFolderRequest) (SavedCollection, error) {
	store, err := a.readSavedAPIStore()
	if err != nil {
		return SavedCollection{}, err
	}

	collection := ensureCollection(&store, req.Collection)
	folderPath := normalizePath(req.FolderPath)
	newName := strings.TrimSpace(req.NewName)
	if newName == "" {
		return SavedCollection{}, fmt.Errorf("folder name is required")
	}

	parts := strings.Split(folderPath, "/")
	parentPath := strings.Join(parts[:len(parts)-1], "/")
	oldName := filepath.Base(folderPath)
	if !sameName(oldName, newName) && folderNameExists(collection.Folders, parentPath, newName, oldName) {
		return SavedCollection{}, fmt.Errorf("folder name already exists")
	}
	nextPath := newName
	if parentPath != "" {
		nextPath = parentPath + "/" + newName
	}

	collection.Folders = renameFolderPath(collection.Folders, parts, newName)

	for index := range store.APIs {
		if store.APIs[index].Collection != req.Collection {
			continue
		}

		apiFolder := normalizePath(store.APIs[index].Folder)
		if apiFolder == folderPath {
			store.APIs[index].Folder = nextPath
		} else if strings.HasPrefix(apiFolder, folderPath+"/") {
			store.APIs[index].Folder = nextPath + strings.TrimPrefix(apiFolder, folderPath)
		}
	}

	if err := a.writeSavedAPIStore(store); err != nil {
		return SavedCollection{}, err
	}

	return *collection, nil
}

func (a *App) DeleteFolder(req FolderPathRequest) error {
	store, err := a.readSavedAPIStore()
	if err != nil {
		return err
	}

	collection := ensureCollection(&store, req.Collection)
	folderPath := normalizePath(req.FolderPath)
	if folderPath == "" {
		return nil
	}

	collection.Folders = deleteFolderPath(collection.Folders, strings.Split(folderPath, "/"))

	apis := []SavedAPI{}
	for _, api := range store.APIs {
		if api.Collection == req.Collection {
			apiFolder := normalizePath(api.Folder)
			if apiFolder == folderPath || strings.HasPrefix(apiFolder, folderPath+"/") {
				continue
			}
		}
		apis = append(apis, api)
	}

	store.APIs = apis
	return a.writeSavedAPIStore(store)
}

func (a *App) CopySavedAPI(req CopySavedAPIRequest) (SavedAPI, error) {
	store, err := a.readSavedAPIStore()
	if err != nil {
		return SavedAPI{}, err
	}

	for _, api := range store.APIs {
		if api.ID != req.ID {
			continue
		}

		api.ID = makeSavedAPIID(api.Name)
		if strings.TrimSpace(req.Name) != "" {
			api.Name = strings.TrimSpace(req.Name)
		} else {
			api.Name = api.Name + " Copy"
		}
		api.Collection = strings.TrimSpace(req.Collection)
		if api.Collection == "" {
			api.Collection = "Default"
		}
		api.Folder = normalizePath(req.Folder)
		api.UpdatedAt = time.Now().UnixMilli()

		if savedAPINameExists(store, api.Name, api.Collection, api.Folder, "") {
			return SavedAPI{}, fmt.Errorf("api name already exists in this folder")
		}

		collection := ensureCollection(&store, api.Collection)
		if api.Folder != "" {
			collection.Folders = ensureFolderPath(collection.Folders, strings.Split(api.Folder, "/"))
		}

		store.APIs = append(store.APIs, api)
		if err := a.writeSavedAPIStore(store); err != nil {
			return api, err
		}
		return api, nil
	}

	return SavedAPI{}, fmt.Errorf("saved api not found")
}

func (a *App) SaveSavedAPI(api SavedAPI) (SavedAPI, error) {
	store, err := a.readSavedAPIStore()
	if err != nil {
		return api, err
	}

	api.Name = strings.TrimSpace(api.Name)
	api.Collection = strings.TrimSpace(api.Collection)
	api.Folder = strings.TrimSpace(api.Folder)
	api.Endpoint = strings.TrimSpace(api.Endpoint)

	if api.Name == "" {
		return api, fmt.Errorf("api name is required")
	}

	if api.Collection == "" {
		api.Collection = "Default"
	}
	api.Folder = normalizePath(api.Folder)

	if savedAPINameExists(store, api.Name, api.Collection, api.Folder, api.ID) {
		return api, fmt.Errorf("api name already exists in this folder")
	}

	collection := ensureCollection(&store, api.Collection)
	if api.Folder != "" {
		collection.Folders = ensureFolderPath(collection.Folders, strings.Split(api.Folder, "/"))
	}

	if api.ID == "" {
		api.ID = makeSavedAPIID(api.Name)
	}

	api.UpdatedAt = time.Now().UnixMilli()

	replaced := false
	for index, item := range store.APIs {
		if item.ID == api.ID {
			store.APIs[index] = api
			replaced = true
			break
		}
	}

	if !replaced {
		store.APIs = append(store.APIs, api)
	}

	if err := a.writeSavedAPIStore(store); err != nil {
		return api, err
	}

	return api, nil
}

func (a *App) DeleteSavedAPI(id string) error {
	store, err := a.readSavedAPIStore()
	if err != nil {
		return err
	}

	nextAPIs := []SavedAPI{}
	for _, api := range store.APIs {
		if api.ID != id {
			nextAPIs = append(nextAPIs, api)
		}
	}
	store.APIs = nextAPIs

	return a.writeSavedAPIStore(store)
}

func (a *App) RenameSavedAPI(id string, newName string) error {
	store, err := a.readSavedAPIStore()
	if err != nil {
		return err
	}
	newName = strings.TrimSpace(newName)
	if newName == "" {
		return fmt.Errorf("api name is required")
	}

	for index, api := range store.APIs {
		if api.ID == id {
			if !sameName(api.Name, newName) && savedAPINameExists(store, newName, api.Collection, api.Folder, id) {
				return fmt.Errorf("api name already exists in this folder")
			}
			store.APIs[index].Name = newName
			store.APIs[index].UpdatedAt = time.Now().UnixMilli()
			return a.writeSavedAPIStore(store)
		}
	}

	return fmt.Errorf("saved api not found")
}

// Hàm tải trạng thái khi mở App (Được export xuống Frontend)
func (a *App) LoadState() (AppState, error) {
	filePath := filepath.Join(a.configDir, "state.json")
	var state AppState

	// Nếu file chưa tồn tại (Lần đầu mở app), trả về trạng thái mặc định ban đầu
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return AppState{
			Theme:        "dark",
			LastEndpoint: "http://localhost:4000/graphql",
			History:      []GraphQLRequest{},
		}, nil
	}

	// Đọc dữ liệu từ file
	data, err := os.ReadFile(filePath)
	if err != nil {
		return state, err
	}

	// Giải mã JSON vào struct
	err = json.Unmarshal(data, &state)
	return state, err
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

func removeFolder(folders []SavedFolder, parts []string) ([]SavedFolder, *SavedFolder) {
	if len(parts) == 0 {
		return folders, nil
	}

	name := parts[0]
	for index, folder := range folders {
		if folder.Name == name {
			if len(parts) == 1 {
				updated := append(folders[:index], folders[index+1:]...)
				return updated, &folder
			} else {
				updatedFolders, removed := removeFolder(folder.Folders, parts[1:])
				if removed != nil {
					folders[index].Folders = updatedFolders
					return folders, removed
				}
			}
		}
	}
	return folders, nil
}

func insertFolderAt(folders []SavedFolder, parts []string, toInsert SavedFolder, siblingName string, dropPosition string) ([]SavedFolder, bool) {
	if len(parts) == 0 {
		if dropPosition == "before" || dropPosition == "after" {
			idx := -1
			for i, f := range folders {
				if f.Name == siblingName {
					idx = i
					break
				}
			}
			if idx != -1 {
				targetIdx := idx
				if dropPosition == "after" {
					targetIdx = idx + 1
				}
				updated := make([]SavedFolder, 0, len(folders)+1)
				updated = append(updated, folders[:targetIdx]...)
				updated = append(updated, toInsert)
				updated = append(updated, folders[targetIdx:]...)
				return updated, true
			}
		}
		return append(folders, toInsert), true
	}

	name := parts[0]
	for index, folder := range folders {
		if folder.Name == name {
			updatedFolders, success := insertFolderAt(folder.Folders, parts[1:], toInsert, siblingName, dropPosition)
			if success {
				folders[index].Folders = updatedFolders
				return folders, true
			}
		}
	}
	return folders, false
}

func (a *App) MoveFolder(req MoveFolderRequest) (SavedCollection, error) {
	store, err := a.readSavedAPIStore()
	if err != nil {
		return SavedCollection{}, err
	}

	srcCollectionName := strings.TrimSpace(req.SrcCollection)
	srcPath := normalizePath(req.SrcPath)
	destCollectionName := strings.TrimSpace(req.DestCollection)
	destPath := normalizePath(req.DestPath)
	dropPosition := strings.TrimSpace(req.DropPosition)

	if srcCollectionName == "" || srcPath == "" || destCollectionName == "" {
		return SavedCollection{}, fmt.Errorf("invalid move folder request")
	}

	// 1. Find and remove the folder from the source collection
	var srcCollection *SavedCollection
	for index := range store.Collections {
		if store.Collections[index].Name == srcCollectionName {
			srcCollection = &store.Collections[index]
			break
		}
	}

	if srcCollection == nil {
		return SavedCollection{}, fmt.Errorf("source collection not found")
	}

	srcParts := strings.Split(srcPath, "/")
	updatedSrcFolders, removedFolder := removeFolder(srcCollection.Folders, srcParts)
	if removedFolder == nil {
		return SavedCollection{}, fmt.Errorf("folder to move not found")
	}
	srcCollection.Folders = updatedSrcFolders

	// 2. Determine destParentPath and siblingName based on dropPosition
	var destParentPath string
	var siblingName string

	if dropPosition == "inside" {
		destParentPath = destPath
		siblingName = ""
	} else {
		// before or after
		if destPath == "" {
			destParentPath = ""
			siblingName = ""
		} else {
			destParts := strings.Split(destPath, "/")
			siblingName = destParts[len(destParts)-1]
			destParentPath = strings.Join(destParts[:len(destParts)-1], "/")
		}
	}

	// 3. Insert the folder into the destination collection
	destCollection := ensureCollection(&store, destCollectionName)
	if folderNameExists(destCollection.Folders, destParentPath, removedFolder.Name, "") {
		return SavedCollection{}, fmt.Errorf("folder name already exists")
	}
	destParentParts := []string{}
	if destParentPath != "" {
		destParentParts = strings.Split(destParentPath, "/")
	}

	updatedDestFolders, success := insertFolderAt(destCollection.Folders, destParentParts, *removedFolder, siblingName, dropPosition)
	if !success {
		destCollection.Folders = append(destCollection.Folders, *removedFolder)
		destParentPath = ""
	} else {
		destCollection.Folders = updatedDestFolders
	}

	// 4. Update the folder paths and collections for APIs in store.APIs
	folderName := srcParts[len(srcParts)-1]
	newFolderPrefix := folderName
	if destParentPath != "" {
		newFolderPrefix = destParentPath + "/" + folderName
	}

	for index := range store.APIs {
		api := &store.APIs[index]
		if api.Collection != srcCollectionName {
			continue
		}

		apiFolder := normalizePath(api.Folder)
		if apiFolder == srcPath {
			api.Collection = destCollectionName
			api.Folder = newFolderPrefix
		} else if strings.HasPrefix(apiFolder, srcPath+"/") {
			api.Collection = destCollectionName
			api.Folder = newFolderPrefix + strings.TrimPrefix(apiFolder, srcPath)
		}
	}

	// 5. Save the updated store
	if err := a.writeSavedAPIStore(store); err != nil {
		return SavedCollection{}, err
	}

	return *destCollection, nil
}
