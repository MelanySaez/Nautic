import React from 'react';
import styled from 'styled-components';

// Simple hamburger icon toggle. Props: checked, onChange, ariaLabel
const MenuIcon = ({ checked, onChange, ariaLabel = 'Menú' }) => {
  return (
    <StyledWrapper aria-label={ariaLabel} title={ariaLabel}>
      <input type="checkbox" id="menu-toggle" checked={checked} onChange={onChange} />
      <label htmlFor="menu-toggle" className="toggle">
        <div className="bars" id="bar1" />
        <div className="bars" id="bar2" />
        <div className="bars" id="bar3" />
      </label>
    </StyledWrapper>
  );
};

const StyledWrapper = styled.div`
  #menu-toggle { display: none; }
  .toggle { position: relative; width: 28px; height: 28px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; transition-duration: .5s; color: var(--bs-body-color); }
  .bars { width: 100%; height: 3px; background-color: currentColor; border-radius: 4px; }
  #bar2 { transition-duration: .8s; }
  #bar1, #bar3 { width: 70%; }
  #menu-toggle:checked + .toggle .bars { position: absolute; transition-duration: .5s; }
  #menu-toggle:checked + .toggle #bar2 { transform: scaleX(0); transition-duration: .5s; }
  #menu-toggle:checked + .toggle #bar1 { width: 100%; transform: rotate(45deg); transition-duration: .5s; }
  #menu-toggle:checked + .toggle #bar3 { width: 100%; transform: rotate(-45deg); transition-duration: .5s; }
  #menu-toggle:checked + .toggle { transition-duration: .5s; transform: rotate(180deg); }
`;

export default MenuIcon;
