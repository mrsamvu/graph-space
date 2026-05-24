import { useState } from 'react';
import logo from '../../assets/images/logo/logo.svg';
import sizeDown from '../../assets/icons/size-down.svg';
import { Minus, Square, X } from 'lucide-react';

export const Header: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  const handleMinimize = () =>
    (window as any).runtime.WindowMinimise();

  const handleMaximize = () => {
    (window as any).runtime.WindowToggleMaximise();
    setIsMaximized(!isMaximized);
  };

  const handleClose = () =>
    (window as any).runtime.WindowQuit();

  return (
    <header
      className="flex justify-between items-center h-[50px] pr-3 pl-2.5 w-full bg-black-1 border-b border-b-gray-2"
      style={{ '--wails-draggable': 'drag' } as React.CSSProperties}
    >
      {/* Logo */}
      <div className="flex items-center gap-2">
        <img
          src={logo}
          className="w-[28px] h-[28px]"
        />
      </div>

      {/* Window Controls */}
      <div
        className="flex items-center gap-2"
        style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
      >
        {/* Minimize */}
        <Minus size={20} className='cursor-pointer mt-2.5'/>

        {/* Maximize */}
        <button
          onClick={handleMaximize}
          className="
            w-10 h-10
            flex items-center justify-center
            text-white
            transition-all duration-200
          ">
          {isMaximized ? (
            <img
              src={sizeDown}
              className="w-[14px] h-[14px]"
            />
          ) : <Square size={16}/>}
        </button>

        {/* Close */}
        <X onClick={handleClose} className='text-white/80 cursor-pointer'/>
      </div>
    </header>
  );
};