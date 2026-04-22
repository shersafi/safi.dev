import React from "react";
import styled from "styled-components";
import { useLocation } from "@reach/router";

import { Navbar } from "../Navbar";
import Footer from "../../components/Footer/index";
import { SkipToContent } from "../SkipToContent";
import DotGridBackground from "../DotGridBackground";

import { GlobalStyle } from "../../theme/GlobalStyle";

const SiteChrome = styled.div`
  position: relative;
  z-index: 1;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const MainContent = styled.main`
  flex: 1;
  ${({ $animate }) =>
    $animate
      ? `animation: fadeUp 1.5s cubic-bezier(0.22, 1, 0.36, 1) 0.7s both;`
      : `animation: fadeIn 0.5s ease both;`}
`;

export const Layout = ({ children }) => {
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  return (
    <>
      <GlobalStyle />
      <DotGridBackground />
      <SiteChrome>
        <SkipToContent />
        <Navbar isHome={isHome} />
        <MainContent $animate={isHome}>{children}</MainContent>
        <Footer isHome={isHome} />
      </SiteChrome>
    </>
  );
};
