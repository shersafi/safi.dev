import React, { useEffect, useState } from "react";
import onClickOutside from "react-onclickoutside";
import styled from "styled-components";
import { Link } from "gatsby"
import Logo from "../../images/icon.png";
import { nav } from "../../content/config";
import { blueBox } from "../../theme/mixins";
import { UnstyledLink } from "../UnstyledLink";
import Darkmode from 'darkmode-js';
import '../Navbar/darkmode-js.css';
import 'font-awesome/css/font-awesome.min.css';



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
  label: '🌓', // default: ''\
  autoMatchOsTheme: true // default: true
}


const darkmode = new Darkmode(options);

darkmode.showWidget();


const Wrapper = styled.div`
  padding-top: 20px;
  padding-right: 30px;
  padding-left: 30px;
  padding-bottom: 50px;

  background-color: var(--color-background);



  display: flex;
  justify-content: space-between;
  align-items: center;

  

  
`;

const Nav = styled.nav`
  .nav-ul {
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
  }

  .hamburger {
    position: absolute;
    right: 35px;
    top: 35px;
    background-color: transparent;
    border: 0;
    color: #646478;
    font-size: 30px;
    cursor: pointer;
    display: none;
    transform: translateY(-15%);
    
  }

  .hamburger:focus {
    outline: none;
  }

  .dropdown {
    position: absolute;
    box-shadow: 0 0.25rem 1rem rgb(0 0 0 / 12%);
    border-radius: 1rem;
    white-space: nowrap;
    margin-left: 0;
    display: none;
    font-size: 18px;
    transform: translateY(25%);
    font-family: var(--font-sans);
    font-weight: 450;
    top: -15px;
    right: 30px;
    text-align: center;
  }

  

  .dropdown ul li:before {
    display: none;
  }

  .dropdown ul {
    display:table;
    margin:0px auto 5px auto;
  }
  
  @media screen and (max-width: 700px) {
    .nav-ul {
      display: none;
    }

    .dropdown {
      display: block;
    }

    .hamburger {
      display: block;
    }
    
  }

  
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

const Results = () => (
  <div className="dropdown" id="dropdown">
          <ul className="items" id="items">
            <li><a href={"/"}>Home</a></li>
            <li><a href={"/projects"}>Projects</a></li>
            <li><a href={"/blog"}>Blog</a></li>
          </ul>
        </div>
)

export const Navbar = () => {
  
  const [isOpen, setIsOpen] = useState(false);
  const toggle = () => setIsOpen(!isOpen);
  Navbar.handleClickOutside = () => setIsOpen(false);

  return (
    <Wrapper>
      <div className="brand">
        <Link to ={"/"} aria-label="Brand Logo" className="brand__logo">
          <img class="site-logo" src={Logo} width="60" height="60"/>
        </Link>

      </div>
      
      <Nav>
        <button className="hamburger" id="hamburger" onClick={toggle}>
          { !isOpen ? <i className="fa fa-bars"></i> : null}
        </button> { isOpen ? <Results/> : null }
        
        
        
        <ul className="nav-ul" id="nav-ul">
          {nav &&
            nav.map(({ name, to }, i) => (
              <NavLink to={to} key={i}>
                {name}
              </NavLink>
            ))}
        </ul>
        
      </Nav>
    </Wrapper>
  );
  
};

const clickOutsideConfig = {
  handleClickOutside: () => Menu.handleClickOutside
};

export default onClickOutside(Navbar, clickOutsideConfig);