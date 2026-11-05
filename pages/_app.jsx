import Head from "next/head";
import { useRouter } from "next/router";
import "../styles/globals.css";
import { AuthProvider } from "../components/authContext";
import Layout from "../components/layout";
import { useEffect } from "react";

const PUBLIC = ["/login", "/"];

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const isPublic = PUBLIC.includes(router.pathname);

  useEffect(() => {
    fetch("/api/visit").catch(() => {});
  }, [router]);

  return (
    <AuthProvider>
      <Head>
        <title>Ramadan Basket Manager</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <link rel="icon" href="/logo.png" />
      </Head>
      {isPublic ? (
        <Component {...pageProps} />
      ) : (
        <Layout>
          <Component {...pageProps} />
        </Layout>
      )}
    </AuthProvider>
  );
}
