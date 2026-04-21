import React from "react";
import { graphql } from "gatsby";
import styled from "styled-components";

import { Container } from "../components/Container";
import { Layout } from "../components/Layout";
import { TextLink } from "../components/TextLink";
import { Sidenote } from "../components/Sidenote";
import { TagLink } from "../components/TagLink";
import { SEO } from "../components/SEO";

const shortcodes = {
  a: ({ href, children }) => <TextLink to={href}>{children}</TextLink>,
  aside: ({ className, children }) => <Sidenote className={className}>{children}</Sidenote>,
};

const Header = styled.header`
  text-align: center;
  margin-bottom: 1em;
`;

const Tags = styled.span`
  font-size: var(--font-size-base);

  text-transform: uppercase;

  color: var(--color-accent);

  font-weight: 500;

  display: flex;
  gap: var(--font-size-base);
  justify-content: center;
`;

const PostTemplate = ({ data, children }) => {
  const { frontmatter, fields } = data.mdx;

  return (
    <Layout>
      <Container id="main-content">
        <Header>
          <h1>{frontmatter.title}</h1>
          <p>{frontmatter.date}</p>
          <Tags>
            {frontmatter.tags
              ? frontmatter.tags.map((tag, i) => <TagLink tag={tag} key={i} />)
              : null}
          </Tags>
        </Header>
        <article>{children}</article>
      </Container>
    </Layout>
  );
};

export default PostTemplate;

export const Head = ({ data }) => <SEO title={data.mdx.frontmatter.title} />;

export const query = graphql`
  query PostsByID($id: String!) {
    mdx(id: { eq: $id }) {
      frontmatter {
        title
        tags
        date(formatString: "Do MMMM YYYY")
      }
      fields {
        slug
      }
    }
  }
`;
