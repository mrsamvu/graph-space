package main

import (
	"context"
	"embed"

	"graph-space/services"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var icon []byte

func main() {
	// Create an instance of the app structure
	app := NewApp()
	userService := services.NewUserService()
	callAPIService := services.NewCallAPIService()

	// Create application with options
	err := wails.Run(&options.App{
		Title:     "Graph Space",
		Width:     1024,
		Height:    768,
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		Linux: &linux.Options{
			Icon:        icon,
			ProgramName: "graph-space",
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup: func(ctx context.Context) {
			app.startup(ctx)
			callAPIService.Startup(ctx)
		},
		Bind: []interface{}{
			app,
			userService,
			callAPIService,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
