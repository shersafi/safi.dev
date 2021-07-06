import React from "react";

import Darkmode from 'darkmode-js';
import { Navbar } from "../Navbar";
import { Footer } from "../Footer";
import { SkipToContent } from "../SkipToContent";
import { SEO } from "../SEO";

import { GlobalStyle } from "../../theme/GlobalStyle";

const options = {
  bottom: '32px', // default: '32px'
  right: '32px', // default: '32px'
  left: 'unset', // default: 'unset'
  time: '0.5s', // default: '0.3s'
  mixColor: '#fff', // default: '#fff'
  backgroundColor: '#fff',  // default: '#fff'
  buttonColorDark: '#1F1F2D',  // default: '#100f2c'
  buttonColorLight: '#fff', // default: '#fff'
  saveInCookies: true, // default: true,
  label: '🌞', // default: ''\
  autoMatchOsTheme: true // default: true
}

const darkmode = new Darkmode(options);
darkmode.showWidget();

export const Layout = ({ title, description, children }) => {
  return (
    <>
      <GlobalStyle />
      <SEO title={title} description={description} />
      <SkipToContent />
      <Navbar />
      {children}
      <Footer />
    </>
  );
};
