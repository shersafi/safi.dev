import React from "react";
import { graphql, useStaticQuery } from "gatsby";
import { GatsbyImage, getImage } from "gatsby-plugin-image";
import styled from "styled-components";
import { FaGithub, FaExternalLinkAlt } from "react-icons/fa";

import { UnstyledLink } from "../../UnstyledLink";

import { media } from "../../../theme/mixins";

const Wrapper = styled.section`
  display: flex;
  flex-direction: column;
  gap: calc(2 * var(--font-size-base));
  transition: top ease 0.5s;
  position: relative;


`;


const Project = styled.article`
  position: relative;
  height: 100%;
  border-radius: 10px;
  box-shadow: 0 0.25rem 1rem rgb(0 0 0 / 12%);
  transition: top ease 0.5s;

  .smicons {
    display: grid;
    grid-template-columns: repeat(2, min-content);
    grid-template-rows: min-content;
    gap: 20px;
  }

  
  
  
`;

const Title = styled.h2`
  color: #1F1F2D;
`;

const Body = styled.div`
  position: absolute;
  z-index: 1;
  padding: 30px;
  color: #1F1F2D;
  transition: top ease 0.5s;
  
  line-height: 50px;
  

  height: auto;
  width: 80%;

  display: flex;
  flex-direction: column;
  justify-content: top;
  

  opacity: 1;
  transform: translateY(0);


`;

export const FeaturedProjects = () => {
  const data = useStaticQuery(graphql`
    {
      allMdx(
        filter: { fileAbsolutePath: { regex: "/projects/" } }
        sort: { fields: frontmatter___title, order: ASC }
      ) {
        edges {
          node {
            id
            frontmatter {
              title
              description
              tags
              link
              image {
                childImageSharp {
                  gatsbyImageData(
                    width: 702
                    height: 220
                    quality: 100
                    layout: CONSTRAINED
                    formats: [AUTO, WEBP, AVIF]
                    
                  )
                }
              }
            }
          }
        }
      }
    }
  `);

  const projects = data.allMdx.edges;

  return (
    <Wrapper>
      {projects &&
        projects.map(({ node: { id, frontmatter: { title, description, tags, link, image } } }) => (
          <UnstyledLink key={id} to={link}>
            <Project>
              
            
              <Body> 
                <Title>{title}</Title>
                <p>{description}</p>
                <ol class="smicons">
                  <a
                      
                      href="https://github.com/shersafi"
                      target="_blank"
                      class="icons"
                      rel="noopener noreferrer"
                  >
                      <FaGithub size={30} />
                  </a>

                  <a
                      href="https://github.com/shersafi"
                      target="_blank"
                      class="icons"
                      rel="noopener noreferrer"
                  >
                      <FaExternalLinkAlt size={30} />
                  </a>

                  
                </ol>
                
              </Body>
              <GatsbyImage image={getImage(image)} alt={description} />
            </Project>

            
          </UnstyledLink>
        ))}
    </Wrapper>
  );
};
