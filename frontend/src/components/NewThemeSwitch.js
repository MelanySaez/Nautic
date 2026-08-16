// src/components/NewThemeSwitch.js
import React from 'react';
import './NewThemeSwitch.css';

const NewThemeSwitch = ({ checked, onChange, ariaLabel }) => {
  console.log('🎛️ NewThemeSwitch render - checked:', checked);
  
  const handleChange = (e) => {
    console.log('🖱️ NewThemeSwitch clicked! Event:', e);
    console.log('🎯 Checkbox checked state:', e.target.checked);
    console.log('📞 Calling onChange function');
    if (onChange) {
      onChange(e);
    }
  };
  
  return (
    <div className="new-toggle-switch">
      {/* Input inside the label: no htmlFor/id to avoid duplicate-id conflicts when multiple switches are rendered */}
      <label className="new-switch-label" onClick={() => console.log('🧲 Label clicked') }>
        <input
          type="checkbox"
          className="new-checkbox"
          checked={checked}
          onChange={handleChange}
          aria-label={ariaLabel}
        />
        <span className="new-slider"></span>
      </label>
    </div>
  );
};

export default NewThemeSwitch;