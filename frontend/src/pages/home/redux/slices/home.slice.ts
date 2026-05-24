import { createSlice } from '@reduxjs/toolkit';

const appSlice = createSlice({
  name: 'app',
  initialState: {
    lastEndpoint: 'http://localhost:4000/graphql',
    // history: [],
  },
  reducers: {
    // Dùng để nạp toàn bộ data từ file json của Go lên RAM khi mở app
    setWholeState: (state, action) => {
      return { ...state, ...action.payload };
    },
    // Thay đổi endpoint khi user gõ vào ô nhập liệu
    setEndpoint: (state, action) => {
      state.lastEndpoint = action.payload;
    },
    // Thêm một câu query vừa test vào lịch sử
    // addHistoryItem: (state, action) => {
    //   state.history.unshift(action.payload); // Tự động thêm vào đầu mảng an toàn
    // },
  },
});

export const { setWholeState, setEndpoint } = appSlice.actions;
export default appSlice.reducer;