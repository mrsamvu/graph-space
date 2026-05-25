import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { GetUser } from '../../../wailsjs/go/services/UserService'
// Define type for URL params
type PostParams = {
  id: string;
};

const PostDetail: React.FC = () => {
    // Cast params so TS understands the 'id' variable
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
      <h1>Post Detail {number}</h1>
      <p>Displaying post with ID: <strong>{id}</strong></p>
      
      <hr className='w-full'/>
      <Link to="/">← Back to list</Link>
    </div>
  );
};

export default PostDetail;