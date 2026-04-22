import React, { useEffect, useState, useRef, useCallback } from "react";
import styled, { keyframes, css } from "styled-components";
import { Link } from "gatsby";
import { nav } from "../../content/config";
import { UnstyledLink } from "../UnstyledLink";
import { HiMoon, HiSun } from "react-icons/hi";

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

/* ── Stairs icon (ascending bars like a staircase) ── */
const StairsIcon = ({ size = 22 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round">
    {/* Bottom bar – longest, sits at the bottom */}
    <line x1="3" y1="18" x2="21" y2="18" />
    {/* Middle bar – medium, shifted right */}
    <line x1="7" y1="12" x2="21" y2="12" />
    {/* Top bar – shortest, shifted right more */}
    <line x1="11" y1="6" x2="21" y2="6" />
  </svg>
);

const CloseIcon = ({ size = 22 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round">
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

const entranceEasing = "cubic-bezier(0.22, 1, 0.36, 1)";

const Wrapper = styled.div`
  padding: 20px 30px 50px;
  display: flex;
  justify-content: space-between;
  align-items: center;

  .brand__logo {
    display: flex;
    align-items: center;
    ${({ $animate }) =>
      $animate
        ? `animation: flyDown 1.5s ${entranceEasing} 0.35s both;`
        : `animation: fadeIn 0.5s ease both;`}
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
  ${({ $animate }) =>
    $animate
      ? `animation: flyDown 1.5s ${entranceEasing} 0.35s both;`
      : `animation: fadeIn 0.5s ease both;`}
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
    background: var(--glass-bg);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    border: 1px solid var(--glass-border);
    box-shadow: var(--box-shadow-pill);
    transition:
      box-shadow 0.3s ease,
      background 0.3s ease,
      border-color 0.3s ease;
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

  @media screen and (max-width: 700px) {
    .nav-ul {
      display: none;
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

/* ── Mobile menu trigger (glassmorphic circle matching theme toggle) ── */
const MobileMenuButton = styled.button`
  display: none;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
  cursor: pointer;
  color: var(--color-text);
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  box-shadow: var(--box-shadow-pill);
  transition:
    color 0.3s ease,
    background 0.3s ease,
    box-shadow 0.3s ease,
    border-color 0.3s ease;
  flex-shrink: 0;
  z-index: 1001;
  position: relative;

  &:hover {
    color: var(--color-heading);
  }

  &:focus {
    outline: none;
  }

  @media screen and (max-width: 700px) {
    display: flex;
  }
`;

/* ── Full-screen takeover menu ── */
const menuFadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;
const menuFadeOut = keyframes`
  from { opacity: 1; }
  to   { opacity: 0; }
`;

const MenuTakeover = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: var(--color-background);
  display: flex;
  flex-direction: column;
  padding: 20px 30px;
  animation: ${({ $closing }) => ($closing ? menuFadeOut : menuFadeIn)} 0.3s ${entranceEasing}
    forwards;
`;

const MenuHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 48px;

  .menu-logo {
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

const MenuCloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover {
    color: var(--color-heading);
  }

  &:focus {
    outline: none;
  }
`;

const MenuLinks = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 4px;
`;

/* ── Staggered link animations ── */
const mlinkIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;
const mlinkOut = keyframes`
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-10px);
  }
`;

const MenuLink = styled(Link)`
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 28px;
  color: var(--color-heading);
  text-decoration: none;
  padding: 12px 0;
  transition: color 0.2s ease;
  opacity: 0;

  animation: ${({ $closing, $i }) =>
    $closing
      ? css`
          ${mlinkOut} 0.2s ${entranceEasing} ${$i * 0.03}s forwards
        `
      : css`
          ${mlinkIn} 0.45s ${entranceEasing} ${0.1 + $i * 0.06}s forwards
        `};

  &:hover {
    color: var(--color-accent);
  }

  &:before {
    display: none;
    content: none;
  }
`;

const ThemeToggleBlob = styled.button`
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
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
    background 0.45s ease,
    box-shadow 0.3s ease,
    border-color 0.3s ease;
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
    background: var(--glass-bg);
  }
`;

const OVERLAY_EXIT_MS = 400;

export const Navbar = ({ isHome = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [theme, setTheme] = useState("light");
  const toggleRef = useRef(null);

  /* ── Theme init ── */
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

  /* ── Body scroll lock ── */
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  /* ── Close with exit animation ── */
  const closeMenu = useCallback(() => {
    if (!isOpen || closing) return;
    setClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setClosing(false);
    }, OVERLAY_EXIT_MS);
  }, [isOpen, closing]);

  const openMenu = useCallback(() => {
    setIsOpen(true);
    setClosing(false);
  }, []);

  const toggleMenu = useCallback(() => {
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  }, [isOpen, closeMenu, openMenu]);

  /* ── Theme toggle ── */
  const toggleTheme = useCallback(() => {
    const newTheme = theme === "light" ? "dark" : "light";
    const goingDark = newTheme === "dark";

    const btn = toggleRef.current;
    const rect = btn.getBoundingClientRect();
    document.documentElement.style.setProperty("--vt-x", `${rect.left + rect.width / 2}px`);
    document.documentElement.style.setProperty("--vt-y", `${rect.top + rect.height / 2}px`);

    setVtDirection(goingDark ? "expand" : "contract");

    if (document.startViewTransition) {
      const transition = document.startViewTransition(() => {
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("theme", newTheme);
      });
      if (goingDark) {
        setTheme(newTheme);
      } else {
        transition.finished.then(() => setTheme(newTheme));
      }
    } else {
      document.documentElement.setAttribute("data-theme", newTheme);
      setTheme(newTheme);
      localStorage.setItem("theme", newTheme);
    }
  }, [theme]);

  return (
    <Wrapper $animate={isHome}>
      <div className="brand">
        <Link to="/" aria-label="Brand Logo" className="brand__logo">
          <span className="site-logo" aria-hidden="true" />
        </Link>
      </div>

      <RightSection $animate={isHome}>
        <Nav>
          <ul className="nav-ul" id="nav-ul">
            {nav &&
              nav.map(({ name, to }, i) => (
                <NavLink to={to} key={i}>
                  {name}
                </NavLink>
              ))}
          </ul>
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

        <MobileMenuButton onClick={toggleMenu} aria-label="Toggle menu" id="hamburger">
          {isOpen && !closing ? <CloseIcon /> : <StairsIcon />}
        </MobileMenuButton>
      </RightSection>

      {/* Full-screen takeover menu */}
      {isOpen && (
        <MenuTakeover $closing={closing}>
          <MenuHeader>
            <Link to="/" aria-label="Home" onClick={closeMenu}>
              <span className="menu-logo" aria-hidden="true" />
            </Link>
            <MenuCloseButton onClick={closeMenu} aria-label="Close menu">
              <CloseIcon size={22} />
            </MenuCloseButton>
          </MenuHeader>
          <MenuLinks>
            {nav.map(({ name, to }, i) => (
              <MenuLink to={to} key={i} $i={i} $closing={closing} onClick={closeMenu}>
                {name}
              </MenuLink>
            ))}
          </MenuLinks>
        </MenuTakeover>
      )}
    </Wrapper>
  );
};

export default Navbar;
