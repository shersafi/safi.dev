import React from "react";
import styled from "styled-components";
import { graphql } from "gatsby";
import { format, parseISO } from "date-fns";
import { Layout } from "../components/Layout";
import { Container } from "../components/Container";
import { TextLink } from "../components/TextLink";
import { CardLink } from "../components/Card";
import { SEO } from "../components/SEO";
import me from "../images/me.png";

const Hero = styled.header`
  p {
    font-size: 20px;
  }
  h1 {
    text-align: center;
    font-size: 44px;
  }
  .center {
    display: block;
    margin-left: auto;
    margin-right: auto;
    transform: scale(0.9, 0.9);
  }

  .wave {
    animation-name: wave-animation;
    animation-duration: 2.5s;
    animation-iteration-count: infinite;
    transform-origin: 70% 70%;
    display: inline-block;
  }

  @keyframes wave-animation {
    0% {
      transform: rotate(0deg);
    }
    10% {
      transform: rotate(14deg);
    }
    20% {
      transform: rotate(-8deg);
    }
    30% {
      transform: rotate(14deg);
    }
    40% {
      transform: rotate(-4deg);
    }
    50% {
      transform: rotate(10deg);
    }
    60% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(0deg);
    }
  }
`;

const PostsContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  grid-row-gap: var(--font-size-base);

  .one {
    width: 15%;
    height: 15px;
    float: left;
    font-size: var(--font-size-sm);
    font-weight: lighter;
    padding: 5px 0;
    color: #79798a;
    transform: translateY(-20%);
  }

  .two {
    position: relative;
    font-size: var(--font-size-sm);
    background-color: #1f1f2d;
    color: white;
    font-style: normal;
    font-weight: lighter;
    border-radius: 20px;
    text-align: center;
    line-height: 20px;
    width: 115px;
    height: 20px;
    left: 85px;
    bottom: 18px;
  }
`;

const IndexPage = ({
  data: {
    allMdx: { nodes },
  },
}) => {
  const post = nodes.map(({ id, frontmatter, fields: { slug } }) => (
    <CardLink title={frontmatter.title} to={slug} key={id}>
      <h2 className="latest-post__title">
        <div className="one">
          {format(parseISO(frontmatter.date), "dd/MM/yyyy")}
          <div className="two">Latest Writing</div>
        </div>
      </h2>
      <p>{frontmatter.description}</p>
    </CardLink>
  ));

  return (
    <Layout>
      <Container id="main-content">
        <Hero>
          <h1>
            Hi there, I am Sher Safi. <span className="wave">👋</span>
          </h1>
          <img src={me} className="center" alt="Sher Safi" />
          <p>
            Software Engineer currently based out of Toronto. My interests are Cryptography &amp;
            Machine Learning. I am also an{" "}
            <TextLink to="https://github.com/shersafi">open-source enthusiast.</TextLink>
          </p>
        </Hero>

        <PostsContainer>{post[0]}</PostsContainer>
      </Container>
    </Layout>
  );
};

export default IndexPage;

export const Head = () => <SEO title="Home" />;

export const query = graphql`
  query {
    allMdx(
      sort: { frontmatter: { date: DESC } }
      filter: { frontmatter: { published: { eq: true } } }
    ) {
      nodes {
        id
        frontmatter {
          title
          date
          description
        }
        fields {
          slug
        }
      }
    }
  }
`;
