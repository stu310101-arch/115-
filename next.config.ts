import type { NextConfig } from "next";

const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";
const githubPagesBasePath =
  process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") || "/115-";

const nextConfig: NextConfig = {
  output: isGitHubPagesBuild ? "export" : undefined,
  basePath: isGitHubPagesBuild ? githubPagesBasePath : undefined,
  trailingSlash: isGitHubPagesBuild,
  images: {
    unoptimized: isGitHubPagesBuild,
  },
};

export default nextConfig;
