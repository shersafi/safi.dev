import React from "react";
import { Container } from "../components/Container";
import { Emoji } from "../components/Emoji";
import { Layout } from "../components/Layout";
import { SEO } from "../components/SEO";

const NotFoundPage = () => {
  return (
    <Layout>
      <Container id="main-content">
        <section>
          <h2>Oops!</h2>
          <p>
            It doesn't look like that pages exists <Emoji emoji="😕" />
          </p>
          <p>Maybe double check the URL to make sure it's correct?</p>
        </section>
      </Container>
    </Layout>
  );
};

export default NotFoundPage;

export const Head = () => <SEO title="404 — Page Not Found" />;
