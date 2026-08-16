// src/components/NewMenuIcon.js
import React from 'react';
import './NewMenuIcon.css';

const NewMenuIcon = ({ checked, onChange, ariaLabel }) => {
  return (
    <label className="new-burger" htmlFor="burger">
      <input 
        type="checkbox" 
        id="burger"
        checked={checked}
        onChange={onChange}
        aria-label={ariaLabel}
      />
      <span></span>
      <span></span>
      <span></span>
    </label>
  );
};

export default NewMenuIcon;