import styled from "styled-components";
import kebabCase from "lodash/kebabCase";

import { UnstyledLink } from "../UnstyledLink";

export const TagLink = styled(UnstyledLink).attrs(({ tag }) => ({
  to: `/tags/${kebabCase(tag)}/`,
  children: tag,
}))`
  transition: color 0.15s var(--easing);

  &:hover {
    color: var(--color-heading);
  }
`;
