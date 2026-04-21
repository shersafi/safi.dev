import React, { useEffect, useState, useRef, useCallback } from "react";
import styled from "styled-components";
import { Link } from "gatsby";
import { nav } from "../../content/config";
import { UnstyledLink } from "../UnstyledLink";
import { HiMenu, HiX, HiMoon, HiSun } from "react-icons/hi";

const VT_STYLE_ID = "vt-theme-css";
const LOGO_PATH = "/static/Sher_Logo.svg";

const VT_EXPAND = `
::view-transition-old(root) { animation: none; z-index: 1; }
::view-transition-new(root) {
  animation: vt-clip 0.85s ease-in-out forwards;
  z-index: 9999;
}
@keyframes vt-clip {
  from { clip-path: circle(0px at var(--vt-x, 50%) var(--vt-y, 50%)); }
  to   { clip-path: circle(150vmax at var(--vt-x, 50%) var(--vt-y, 50%)); }
}`;

const VT_CONTRACT = `
::view-transition-new(root) { animation: none; z-index: 1; }
::view-transition-old(root) {
  animation: vt-clip 0.85s ease-in-out forwards;
  z-index: 9999;
}
@keyframes vt-clip {
  from { clip-path: circle(150vmax at var(--vt-x, 50%) var(--vt-y, 50%)); }
  to   { clip-path: circle(0px at var(--vt-x, 50%) var(--vt-y, 50%)); }
}`;

function setVtDirection(direction) {
  let el = document.getElementById(VT_STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = VT_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = direction === "expand" ? VT_EXPAND : VT_CONTRACT;
}

const Wrapper = styled.div`
  padding: 20px 30px 50px;
  display: flex;
  justify-content: space-between;
  align-items: center;

  .brand__logo {
    display: flex;
    align-items: center;
  }

  .site-logo {
    display: block;
    width: 64px;
    height: 64px;
    flex-shrink: 0;
    background-color: var(--color-heading);
    transition: background-color 0.3s ease;
    -webkit-mask: url(${LOGO_PATH}) center / contain no-repeat;
    mask: url(${LOGO_PATH}) center / contain no-repeat;
  }
`;

const RightSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const Nav = styled.nav`
  display: flex;
  align-items: center;

  .nav-ul {
    padding: 0 20px;
    height: 48px;
    margin: 0;
    display: flex;
    gap: var(--font-size-md);
    align-items: center;
    white-space: nowrap;
    box-shadow: var(--box-shadow-pill);
    transition: box-shadow 0.3s ease;
    border-radius: 3rem;
    z-index: 13;
    list-style: none;
  }

  .nav-ul li {
    margin: 0;
  }

  .nav-ul li:before {
    display: none;
    content: none;
  }

  .hamburger {
    background-color: transparent;
    border: 0;
    color: var(--color-text);
    font-size: 24px;
    cursor: pointer;
    display: none;
    padding: 8px;
    line-height: 1;
  }

  .hamburger:focus {
    outline: none;
  }

  .dropdown {
    position: absolute;
    box-shadow: var(--box-shadow-pill);
    transition: box-shadow 0.3s ease;
    border-radius: 1rem;
    white-space: nowrap;
    display: block;
    font-size: 18px;
    font-family: var(--font-sans);
    font-weight: 450;
    top: 70px;
    right: 30px;
    text-align: center;
    background-color: var(--color-background);
    z-index: 100;
    padding: 10px 0;
  }

  .dropdown ul li:before {
    display: none;
  }

  .dropdown ul {
    display: table;
    margin: 0px auto 5px auto;
  }

  @media screen and (max-width: 700px) {
    .nav-ul {
      display: none;
    }

    .hamburger {
      display: block;
    }
  }
`;

const NavLink = styled(UnstyledLink)`
  font-weight: 500;
  font-size: 16px;
  color: var(--color-text);
  transition: color 0.175s var(--easing);

  &:hover {
    color: var(--color-heading);
  }
`;

const ThemeToggleBlob = styled.button`
  background: var(--color-background);
  border: none;
  cursor: pointer;
  color: var(--color-text);
  font-size: 20px;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  box-shadow: var(--box-shadow-pill);
  transition:
    color 0.45s ease,
    background-color 0.45s ease,
    box-shadow 0.3s ease;
  flex-shrink: 0;
  position: relative;
  view-transition-name: theme-toggle;

  .icon-morph {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      opacity 0.45s ease,
      transform 0.45s ease;
  }

  .icon-moon {
    opacity: 1;
    transform: rotate(0deg) scale(1);
  }
  .icon-sun {
    opacity: 0;
    transform: rotate(-90deg) scale(0.5);
  }

  &.dark .icon-moon {
    opacity: 0;
    transform: rotate(90deg) scale(0.5);
  }
  &.dark .icon-sun {
    opacity: 1;
    transform: rotate(0deg) scale(1);
  }

  &:hover {
    color: var(--color-heading);
    background-color: var(--color-card-background);
  }
`;

const Results = () => (
  <div className="dropdown" id="dropdown">
    <ul className="items" id="items">
      <li>
        <Link to="/">Home</Link>
      </li>
      <li>
        <Link to="/projects">Projects</Link>
      </li>
      <li>
        <Link to="/blog">Blog</Link>
      </li>
    </ul>
  </div>
);

export const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const navRef = useRef(null);
  const toggleRef = useRef(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === "light" ? "dark" : "light";
    const goingDark = newTheme === "dark";

    // Set circle origin from button center
    const btn = toggleRef.current;
    const rect = btn.getBoundingClientRect();
    document.documentElement.style.setProperty("--vt-x", `${rect.left + rect.width / 2}px`);
    document.documentElement.style.setProperty("--vt-y", `${rect.top + rect.height / 2}px`);

    // Swap the CSS to the correct animation direction BEFORE starting transition
    setVtDirection(goingDark ? "expand" : "contract");

    if (document.startViewTransition) {
      const transition = document.startViewTransition(() => {
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("theme", newTheme);
      });
      if (goingDark) {
        // Expanding: morph icon immediately alongside circle
        setTheme(newTheme);
      } else {
        // Contracting: morph icon only after circle finishes retreating
        transition.finished.then(() => setTheme(newTheme));
      }
    } else {
      document.documentElement.setAttribute("data-theme", newTheme);
      setTheme(newTheme);
      localStorage.setItem("theme", newTheme);
    }
  }, [theme]);

  const toggle = () => setIsOpen(!isOpen);

  return (
    <Wrapper>
      <div className="brand">
        <Link to="/" aria-label="Brand Logo" className="brand__logo">
          <span className="site-logo" aria-hidden="true" />
        </Link>
      </div>

      <RightSection>
        <Nav ref={navRef}>
          <ul className="nav-ul" id="nav-ul">
            {nav &&
              nav.map(({ name, to }, i) => (
                <NavLink to={to} key={i}>
                  {name}
                </NavLink>
              ))}
          </ul>

          <button className="hamburger" id="hamburger" onClick={toggle} aria-label="Toggle menu">
            {isOpen ? <HiX size={24} /> : <HiMenu size={24} />}
          </button>
          {isOpen ? <Results /> : null}
        </Nav>

        <ThemeToggleBlob
          ref={toggleRef}
          onClick={toggleTheme}
          aria-label="Toggle dark mode"
          className={theme === "dark" ? "dark" : ""}>
          <span className="icon-morph icon-moon">
            <HiMoon />
          </span>
          <span className="icon-morph icon-sun">
            <HiSun />
          </span>
        </ThemeToggleBlob>
      </RightSection>
    </Wrapper>
  );
};

export default Navbar;
