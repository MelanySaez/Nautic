import React from 'react';
import styled from 'styled-components';

// Animated theme switch (smaller size), controlled via props
// Props: checked (bool), onChange (fn), ariaLabel (string)
const ThemeSwitch = ({ checked, onChange, ariaLabel = 'Theme' }) => {
  return (
    <StyledWrapper aria-label={ariaLabel} title={ariaLabel}>
      <label className="ts-switch">
        <input id="theme-input" type="checkbox" checked={checked} onChange={onChange} />
        <div className="ts-slider round">
          <div className="sun-moon">
            <svg id="ts-moon-dot-1" className="ts-moon-dot" viewBox="0 0 100 100"><circle cx={50} cy={50} r={50} /></svg>
            <svg id="ts-moon-dot-2" className="ts-moon-dot" viewBox="0 0 100 100"><circle cx={50} cy={50} r={50} /></svg>
            <svg id="ts-moon-dot-3" className="ts-moon-dot" viewBox="0 0 100 100"><circle cx={50} cy={50} r={50} /></svg>
            <svg id="ts-light-ray-1" className="ts-light-ray" viewBox="0 0 100 100"><circle cx={50} cy={50} r={50} /></svg>
            <svg id="ts-light-ray-2" className="ts-light-ray" viewBox="0 0 100 100"><circle cx={50} cy={50} r={50} /></svg>
            <svg id="ts-light-ray-3" className="ts-light-ray" viewBox="0 0 100 100"><circle cx={50} cy={50} r={50} /></svg>
            <svg id="ts-cloud-1" className="ts-cloud-dark" viewBox="0 0 100 100"><circle cx={50} cy={50} r={50} /></svg>
            <svg id="ts-cloud-2" className="ts-cloud-dark" viewBox="0 0 100 100"><circle cx={50} cy={50} r={50} /></svg>
            <svg id="ts-cloud-3" className="ts-cloud-dark" viewBox="0 0 100 100"><circle cx={50} cy={50} r={50} /></svg>
            <svg id="ts-cloud-4" className="ts-cloud-light" viewBox="0 0 100 100"><circle cx={50} cy={50} r={50} /></svg>
            <svg id="ts-cloud-5" className="ts-cloud-light" viewBox="0 0 100 100"><circle cx={50} cy={50} r={50} /></svg>
            <svg id="ts-cloud-6" className="ts-cloud-light" viewBox="0 0 100 100"><circle cx={50} cy={50} r={50} /></svg>
          </div>
          <div className="ts-stars">
            <svg id="ts-star-1" className="ts-star" viewBox="0 0 20 20"><path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" /></svg>
            <svg id="ts-star-2" className="ts-star" viewBox="0 0 20 20"><path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" /></svg>
            <svg id="ts-star-3" className="ts-star" viewBox="0 0 20 20"><path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" /></svg>
            <svg id="ts-star-4" className="ts-star" viewBox="0 0 20 20"><path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" /></svg>
          </div>
        </div>
      </label>
    </StyledWrapper>
  );
};

const StyledWrapper = styled.div`
  .ts-switch { position: relative; display: inline-block; width: 52px; height: 30px; }
  .ts-switch #theme-input { opacity: 0; width: 0; height: 0; }
  .ts-slider { position: absolute; cursor: pointer; inset: 0; background-color: #2196f3; transition: 0.4s; z-index: 0; overflow: hidden; }
  .sun-moon { position: absolute; height: 22px; width: 22px; left: 4px; bottom: 4px; background-color: yellow; transition: 0.4s; }
  #theme-input:checked + .ts-slider { background-color: #0b1220; }
  #theme-input:focus + .ts-slider { box-shadow: 0 0 1px #2196f3; }
  #theme-input:checked + .ts-slider .sun-moon { transform: translateX(22px); background-color: white; animation: rotate-center 0.6s ease-in-out both; }
  .ts-moon-dot { opacity: 0; transition: 0.4s; fill: gray; }
  #theme-input:checked + .ts-slider .sun-moon .ts-moon-dot { opacity: 1; }
  .ts-slider.round { border-radius: 30px; }
  .ts-slider.round .sun-moon { border-radius: 50%; }
  #ts-moon-dot-1 { left: 8px; top: 3px; position: absolute; width: 5px; height: 5px; z-index: 4; }
  #ts-moon-dot-2 { left: 2px; top: 9px; position: absolute; width: 8px; height: 8px; z-index: 4; }
  #ts-moon-dot-3 { left: 14px; top: 16px; position: absolute; width: 3px; height: 3px; z-index: 4; }
  #ts-light-ray-1 { left: -8px; top: -8px; position: absolute; width: 38px; height: 38px; z-index: -1; fill: white; opacity: 0.1; }
  #ts-light-ray-2 { left: -50%; top: -50%; position: absolute; width: 48px; height: 48px; z-index: -1; fill: white; opacity: 0.1; }
  #ts-light-ray-3 { left: -16px; top: -16px; position: absolute; width: 52px; height: 52px; z-index: -1; fill: white; opacity: 0.1; }
  .ts-cloud-light, .ts-cloud-dark { position: absolute; animation-name: cloud-move; animation-duration: 6s; animation-iteration-count: infinite; }
  .ts-cloud-light { fill: #eee; }
  .ts-cloud-dark { fill: #ccc; animation-delay: 1s; }
  #ts-cloud-1 { left: 26px; top: 13px; width: 34px; }
  #ts-cloud-2 { left: 40px; top: 10px; width: 18px; }
  #ts-cloud-3 { left: 16px; top: 22px; width: 26px; }
  #ts-cloud-4 { left: 32px; top: 16px; width: 34px; }
  #ts-cloud-5 { left: 44px; top: 14px; width: 18px; }
  #ts-cloud-6 { left: 20px; top: 24px; width: 26px; }
  @keyframes cloud-move { 0% { transform: translateX(0px);} 40% { transform: translateX(4px);} 80% { transform: translateX(-4px);} 100% { transform: translateX(0px);} }
  .ts-stars { transform: translateY(-28px); opacity: 0; transition: 0.4s; }
  .ts-star { fill: white; position: absolute; transition: 0.4s; animation-name: star-twinkle; animation-duration: 2s; animation-iteration-count: infinite; }
  #theme-input:checked + .ts-slider .ts-stars { transform: translateY(0); opacity: 1; }
  #ts-star-1 { width: 18px; top: 2px; left: 2px; animation-delay: .3s; }
  #ts-star-2 { width: 6px; top: 14px; left: 3px; }
  #ts-star-3 { width: 10px; top: 18px; left: 8px; animation-delay: .6s; }
  #ts-star-4 { width: 16px; top: 0px; left: 16px; animation-delay: 1.3s; }
  @keyframes star-twinkle { 0% { transform: scale(1);} 40% { transform: scale(1.2);} 80% { transform: scale(0.8);} 100% { transform: scale(1);} }
`;

export default ThemeSwitch;
