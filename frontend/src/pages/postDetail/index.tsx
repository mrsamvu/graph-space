import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { GetUser } from '../../../wailsjs/go/services/UserService'
// Định nghĩa kiểu cho params trong URL
type PostParams = {
  id: string;
};

const PostDetail: React.FC = () => {
    // Ép kiểu cho params để TS hiểu có biến 'id'
    const { id } = useParams<PostParams>();
    const [number, setNumber] = useState<string>();
    useEffect(() => {
        if (!id) return;
        (async () => {
            setNumber(await GetUser(1))
        })();
    }, [id]);
  return (
    <div>
      <h1>Chi Tiết Bài Viết {number}</h1>
      <p>Đang hiển thị bài viết có ID: <strong>{id}</strong></p>
      
      <hr className='w-full'/>
      <Link to="/">← Quay lại danh sách</Link>
    </div>
  );
};

export default PostDetail;