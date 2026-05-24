import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import appReducer from '../pages/home/redux/slices/home.slice';
import { SaveState } from '../../wailsjs/go/main/App'; // Thư viện binding từ Wails

// 1. Khởi tạo Listener Middleware
const wailsListenerMiddleware = createListenerMiddleware();

// 2. Cấu hình Listener: Tự động bắt các action 'app/*' để lưu vào file qua Go
wailsListenerMiddleware.startListening({
    predicate: (action) => typeof action.type === 'string' && action.type.startsWith('app/'),
    effect: async (action, listenerApi) => {
        // Bỏ qua hành động nạp dữ liệu ban đầu để tránh vòng lặp vô hạn
        if (action.type === 'app/setWholeState') return;

        // Lấy trạng thái mới nhất trên RAM (Ép kiểu về RootState để có gợi ý code)
        const currentLines = (listenerApi.getState() as RootState).app;

        // Chuyển dữ liệu thành chuỗi JSON và bắn xuống Go lưu ngầm
        try {
            await SaveState(JSON.stringify(currentLines));
        } catch (err) {
            console.error("Lỗi đồng bộ xuống ổ đĩa:", err);
        }
    },
});

// 3. Khởi tạo Redux Store
export const store = configureStore({
    reducer: {
        app: appReducer
    },
    middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(wailsListenerMiddleware.middleware),
});

// 4. Xuất các Kiểu Dữ Liệu (Types) chuẩn của Redux Toolkit dành cho TypeScript
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;