import React from "react";
import styled from "styled-components";
import { Link } from "gatsby"
import Logo from "../../images/lol.png";
import { nav } from "../../content/config";
import { blueBox } from "../../theme/mixins";
import { UnstyledLink } from "../UnstyledLink";

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
  display: flex;
  gap: var(--font-size-md);
  align-items: center;
`;


const NavLink = styled(UnstyledLink)`
  /* ${blueBox}; */

  font-weight: 500;
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
