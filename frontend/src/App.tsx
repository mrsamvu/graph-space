import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Home from './pages/home';
import PostDetail from './pages/postDetail';
import { Header } from './components/header';
// import Home from './pages/Home';
// import PostDetail from './pages/PostDetail';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      {/* <header style={{ padding: '1rem', borderBottom: '1px solid #ccc' }}>
        <nav className='text-white'>
          <Link to="/" style={{ marginRight: '15px' }}>Home</Link>
        </nav>
      </header> */}

      <main className='w-full flex flex-col h-dvh'>
        <Header/>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/post/:id" element={<PostDetail />} />
          {/* Trang báo lỗi 404 */}
          <Route path="*" element={<div>404 - Page not found</div>} />
        </Routes>
      </main>
    </BrowserRouter>
  );
};

export default App;