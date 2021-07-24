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
  transition: top ease 0.1s;
  position: relative;

  

`;


const Project = styled.article`
  background-color: white;

  .darkmode--activated & {
    background-color: #E0E0D2;
  }

  position: relative;
  border-radius: 10px;
  box-shadow: 0 0.25rem 1rem rgb(0 0 0 / 12%);
  
  top: 0;
  transition: top ease 0.5s;

  height: calc(260px - 2vw);

  &:hover {
    top: -10px;
  }

  .smicons {
    display: grid;
    grid-template-columns: repeat(2, min-content);
    grid-template-rows: min-content;
    gap: 20px;
  }

  .languages {
    display: block; 
    position: relative;
    margin-left: 110px; 
    margin-right: auto;
    margin-top: -57px;
    border-radius: 10px;
    background-color: #2F3136;
    color: white;
    padding: 1px 8px 1px 8px;
    height: 30px;
    width: calc(290px - 4%);
    line-height: 1.8;
    font-weight: bold;
    font-family: "Courier New"

    
    
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
  width: 75%;

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
              language
              github
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
        projects.map(({ node: { id, frontmatter: { title, description, tags, link, image, language, github } } }) => (
            <Project>
              
            
              <Body> 
                <Title>{title}</Title>
                <p>{description}</p>

                
                <ol class="smicons">
                  <a
                      
                      href={github}
                      target="_blank"
                      class="icons"
                      rel="noopener noreferrer"
                  >
                      <FaGithub size={30} />
                  </a>

                  <a
                      href={link}
                      target="_blank"
                      class="icons"
                      rel="noopener noreferrer"
                  >
                      <FaExternalLinkAlt size={30} />
                  </a>
       
                </ol>

                <div class="languages">{language}</div>
                
              </Body>
              
              <GatsbyImage image={getImage(image)} alt={description} />
            </Project>

            

        ))}
    </Wrapper>
  );
};
