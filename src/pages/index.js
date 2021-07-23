import React, { useState } from "react";
import styled from "styled-components";
import { graphql } from "gatsby";
import { format, parseISO } from "date-fns";
import { Layout } from "../components/Layout";
import { Container } from "../components/Container";
import { Sidenote } from "../components/Sidenote";
import { TextLink } from "../components/TextLink";
import { Link } from 'gatsby';
import { CardLink } from "../components/Card";
import me from '../images/me.png'



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
    -ms-transform: scale(0.9, 0.9);
    -webkit-transform: scale(0.9, 0.9);
  }

  .wave {
    animation-name: wave-animation;  /* Refers to the name of your @keyframes element below */
    animation-duration: 2.5s;        /* Change to speed up or slow down */
    animation-iteration-count: infinite;  /* Never stop waving :) */
    transform-origin: 70% 70%;       /* Pivot around the bottom-left palm */
    display: inline-block;
  }
  
  @keyframes wave-animation {
      0% { transform: rotate( 0.0deg) }
     10% { transform: rotate(14.0deg) }  /* The following five values can be played with to make the waving more or less extreme */
     20% { transform: rotate(-8.0deg) }
     30% { transform: rotate(14.0deg) }
     40% { transform: rotate(-4.0deg) }
     50% { transform: rotate(10.0deg) }
     60% { transform: rotate( 0.0deg) }  /* Reset for the last half to pause */
    100% { transform: rotate( 0.0deg) }
  }
`;

const PostsContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr;

  grid-row-gap: var(--font-size-base);


  .sidebyside {
    width: 100%;
    height: auto;
    margin: auto;
    position:relative;
  }

  .one {
    width: 15%;
    height: 15px;
    float: left;
    font-size: var(--font-size-sm);
    font-weight: lighter;
    padding: 5px 0;
    color: #79798A;
  }

  .darkmode--activated .one {
    filter: invert(100%);
  }

  

  .two {
    margin-left: 87px;
    height: 15px;
    font-size: var(--font-size-sm);
    background-color: #1F1F2D;
    color: white;  
    font-style: normal;
    font-weight: lighter;
    border-radius: 20px;
    width: 120px;
    height: auto;
    left: 10px;
    line-height: 20px;
    padding-top: 2px;
    vertical-align:top;
    transform: translateY(10%);
    

  }


}
`;

const IndexPage = ({ 
  data: { 
    allMdx: { nodes }, 
  }, 
}) => {
  
  const post = nodes
    .map(({ id, frontmatter, fields: { slug } }) => (
      
      <CardLink title={frontmatter.title} to={slug} key={id}>
        <h2 class="latest-post__title">
          <div className="sidebyside">
            <div className="one">
              {format(parseISO(frontmatter.date), "dd/MM/yyyy")}
            </div>
  
            <div className="two">
              Latest Writing
            </div>
          </div>
        </h2>    
        <p>{frontmatter.description}</p>
      </CardLink>

    
    ));
  
  return ( 
    <Layout title="Home">
      <Container id="main-content">
        <Hero>
          <h1>Hi there, I am Sher Safi. <span class="wave">👋</span></h1>
          <img src={me} class="center"/>
          <p>
            Software Engineer currently based out of Toronto. My interests are Cryptography & Machine Learning. I am also an <TextLink to="https://github.com/shersafi">open-source enthusiast.</TextLink>
          </p>

        </Hero>

        
          <PostsContainer>{post[0]}</PostsContainer>
        
      </Container>
    </Layout>
  );
};



export const query = graphql`
  query {
    allMdx(
      sort: { fields: [frontmatter___date], order: DESC }
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

export default IndexPage;
