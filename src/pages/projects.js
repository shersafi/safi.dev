import React from "react";

import { Container } from "../components/Container";
import { Layout } from "../components/Layout";
import { TextLink } from "../components/TextLink";
import { FeaturedProjects } from "../components/sections/FeaturedProjects";

const ProjectsPage = () => {
  return (
    <Layout title="Projects">
      <Container>
        <header>
          <h1>Projects</h1>
          <p>
            What I am currently working on in my free time. All of my projects are available on <TextLink to="https://github.com/shersafi">here.</TextLink>
          </p>
        </header>
        <FeaturedProjects />

      </Container>
    </Layout>
  );
};

export default ProjectsPage;
