import {useCallback, useState} from 'react';
import logo from './assets/images/logo-universal.png';
import './App.css';
import {Greet} from "../wailsjs/go/main/App";
import "./index.css"

function App() {
    const [resultText, setResultText] = useState("Please enter your name below 👇");
    const [name, setName] = useState('');
    const updateName = (e: any) => setName(e.target.value);
    const updateResultText = (result: string) => setResultText(result);

    const greet = useCallback(() => {
        Greet(name).then(updateResultText);
    }, [name]);

    return (
        <div className="flex items-center justify-center h-screen bg-gray-900">
            <h1 className="text-4xl font-bold text-red-1">
                Hello Wails + Tailwind! 🎉
            </h1>
        </div>
    )
    // return (
    //     <div id="App">
    //         <img src={logo} id="logo" alt="logo"/>
    //         <div id="result" className="result">{resultText}</div>
    //         <div id="input" className="input-box">
    //             <input id="name" className="input" onChange={updateName} autoComplete="off" name="input" type="text"/>
    //             <button className="btn" onClick={greet}>Greet</button>
    //         </div>
    //         <div className='bg-red-500'></div>
    //     </div>
    // )
}

export default App
