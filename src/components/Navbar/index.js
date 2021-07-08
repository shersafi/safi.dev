import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { Link } from "gatsby"
import Logo from "../../images/icon.png";
import { nav } from "../../content/config";
import { blueBox } from "../../theme/mixins";
import { UnstyledLink } from "../UnstyledLink";
import Darkmode from 'darkmode-js';
import darkLogo from "../../images/icon-dark.png";
import '../Navbar/darkmode-js.css';


const options = {
  bottom: '32px', // default: '32px'
  right: '32px', // default: '32px'
  left: 'unset', // default: 'unset'
  time: '0.5s', // default: '0.3s'
  mixColor: '#fff', // default: '#fff'
  backgroundColor: '#fff',  // default: '#fff'
  buttonColorDark: '#1F1F2D',  // default: '#100f2c'
  buttonColorLight: '#E0E0D2', // default: '#fff'
  saveInCookies: true, // default: true,
  label: '⭐', // default: ''\
  autoMatchOsTheme: true // default: true
}


const darkmode = new Darkmode(options);

darkmode.showWidget();


const Wrapper = styled.div`
  padding-top: 20px;
  padding-right: 30px;
  padding-left: 30px;
  padding-bottom: 30px;

  background-color: var(--color-background);

  display: flex;
  justify-content: space-between;
  align-items: center;

`;

const Nav = styled.nav`
  padding-top: 15px;
  padding-right: 20px;
  padding-left: 20px;
  padding-bottom: 15px;
  display: flex;
  gap: var(--font-size-md);
  align-items: center;
  white-space: nowrap;
  box-shadow: 0 0.25rem 1rem rgb(0 0 0 / 12%);
  border-radius: 3rem;
  z-index: 13;

  
`;


const NavLink = styled(UnstyledLink)`
  /* ${blueBox}; */

  font-weight: 500;
  font-size: 16px;
  color: var(--color-text);
  
  transition: color 0.175s var(--easing);

  &:hover {
    color: #000000;
  }

  .darkmode--activated &:hover {
    color: #E67219;
  }

  .darkmode--activated & {
    color: #E0E0D2;
  }
  
`;

export const Navbar = () => {
  return (
    <Wrapper>
      <div className="brand">
        <Link to ={"/"} aria-label="Brand Logo" className="brand__logo">
          <img class="site-logo" src={Logo} width="60" height="60"/>
        </Link>
      </div>

      <Nav>
        {nav &&
          nav.map(({ name, to }, i) => (
            <NavLink to={to} key={i}>
              {name}
            </NavLink>
          ))}
      </Nav>
    </Wrapper>
  );
};