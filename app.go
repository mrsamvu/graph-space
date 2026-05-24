package main

import (
	"context"
	"fmt"
	"encoding/json"
	"os"
	"path/filepath"
)

// App struct4
type App struct {
	ctx context.Context
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
	Theme       string           `json:"theme"`
	LastEndpoint string           `json:"lastEndpoint"`
	History     []GraphQLRequest `json:"history"`
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// Hàm startup chạy tự động khi ứng dụng Wails được bật lên
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

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