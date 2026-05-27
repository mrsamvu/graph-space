import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './global.css'
import App from './App'
import { Provider, useDispatch } from 'react-redux';
import { LoadState } from '../wailsjs/go/main/App'; // Đảm bảo đường dẫn này trỏ chuẩn tới wailsjs
import { setWholeState } from './pages/home/redux/slices/home.slice';
import { store } from './redux/store';

// Component bọc xử lý nạp dữ liệu từ Go ngầm
function AppDataProvider({ children }: { children: React.ReactNode }) {
    const dispatch = useDispatch()
    const [isLoaded, setIsLoaded] = useState(false)

    useEffect(() => {
        LoadState()
            .then((savedState) => {
                if (savedState) {
                    dispatch(setWholeState(savedState))
                }
                setIsLoaded(true)
            })
            .catch((err) => {
                console.error("Lỗi cấu hình hệ thống:", err)
                setIsLoaded(true)
            })
    }, [dispatch])

    if (!isLoaded) {
        return null
    }

    return <>{children}</>
}

// Render ứng dụng
const container = document.getElementById('root')
const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <Provider store={store}>
            <AppDataProvider>
                <App/>
            </AppDataProvider>
        </Provider>
    </React.StrictMode>
)