import React from "react";
import styled from "styled-components";

import { FaGithub, FaLinkedin } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";

const FooterWrapper = styled.footer`
  color: var(--color-text);
  padding: 40px;
`;

const CopyRight = styled.h4`
  color: var(--color-text);
  text-align: center;
  font-weight: 400;
  font-size: 0.9em;
  text-rendering: optimizeLegibility;
  line-height: 1.65rem;
  margin: 0;
`;

const SocialMedia = styled.div`
  display: flex;
  margin: 10px auto;
  text-align: center;
  align-items: center;
  justify-content: center;
  a {
    padding: 0 5px;
    color: var(--color-text);
    transition: color 0.2s ease;

    &:hover {
      color: var(--color-accent);
    }
  }
`;

const Footer = () => (
  <FooterWrapper>
    <CopyRight>&copy; {new Date().getFullYear()} Sher Safi</CopyRight>
    <SocialMedia>
      <a
        href="https://github.com/shersafi"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub">
        <FaGithub size={22} />
      </a>
      <a
        href="https://twitter.com/SherSafi10"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="X (Twitter)">
        <FaXTwitter size={22} />
      </a>
      <a
        href="https://www.linkedin.com/in/sher-safi-7841b31ba/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="LinkedIn">
        <FaLinkedin size={22} />
      </a>
    </SocialMedia>
  </FooterWrapper>
);

export default Footer;
