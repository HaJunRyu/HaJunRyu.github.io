import { IGatsbyImageData } from 'gatsby-plugin-image';

export type PostListItemType = {
  title: string;
  slug: string;
  summary: string;
  categories: string[];
  thumbnail: { gatsbyImageData: IGatsbyImageData };
  content: {
    childMarkdownRemark: { html: string };
  };
  createdAt: string;
};
