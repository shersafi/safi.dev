import React from "react";

import { Navbar } from "../Navbar";
import Footer from "../../components/Footer/index";
import { SkipToContent } from "../SkipToContent";

import { GlobalStyle } from "../../theme/GlobalStyle";

export const Layout = ({ children }) => {
  return (
    <>
      <GlobalStyle />
      <SkipToContent />
      <Navbar />
      {children}
      <Footer />
    </>
  );
};
