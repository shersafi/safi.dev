import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { Link } from "gatsby"
import Logo from "../../images/icon.png";
import { nav } from "../../content/config";
import { blueBox } from "../../theme/mixins";
import { UnstyledLink } from "../UnstyledLink";
import Darkmode from 'darkmode-js';
import darklogo from "../../images/icon-dark.png";

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
`;

export const Navbar = () => {
  return (
    <Wrapper>
      <div className="brand">
        <Link to ={"/"} aria-label="Brand Logo" className="brand__logo">
          <img src={Logo} className="favicon" width="60" height="60" alt="Safi" />
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