import React, { FunctionComponent, useMemo } from 'react';
import CategoryList, { CategoryListProps } from 'components/Main/CategoryList';
import Introduction from 'components/Main/Introduction';
import PostList from 'components/Main/PostList';
import { graphql } from 'gatsby';
import { PostListItemType } from 'types/PostItem.types';
import queryString, { ParsedQuery } from 'query-string';
import Template from 'components/Common/Template';
import { IGatsbyImageData } from 'gatsby-plugin-image';

type IndexPageProps = {
  location: {
    search: string;
  };
  data: {
    allContentfulBlogPost: {
      nodes: PostListItemType[];
    };
    file: {
      childImageSharp: {
        gatsbyImageData: IGatsbyImageData;
      };
    };
  };
};

const IndexPage: FunctionComponent<IndexPageProps> = function ({
  location: { search },
  data: {
    allContentfulBlogPost: { nodes },
    file: {
      childImageSharp: { gatsbyImageData },
    },
  },
}) {
  const parsed: ParsedQuery<string> = queryString.parse(search);
  const selectedCategory: string =
    typeof parsed.category !== 'string' || !parsed.category ? 'All' : parsed.category;

  const categoryList = useMemo(
    () =>
      nodes.reduce(
        (list: CategoryListProps['categoryList'], { categories }: PostListItemType) => {
          categories.forEach(category => {
            if (list[category] === undefined) list[category] = 1;
            else list[category]++;
          });

          list['All']++;

          return list;
        },
        { All: 0 }
      ),
    []
  );
  return (
    <Template>
      <Introduction profileImage={gatsbyImageData} />
      <CategoryList selectedCategory={selectedCategory} categoryList={categoryList} />
      <PostList selectedCategory={selectedCategory} posts={nodes} />
    </Template>
  );
};

export default IndexPage;

export const getPostList = graphql`
  query getPostList {
    allContentfulBlogPost {
      nodes {
        title
        slug
        summary
        categories
        thumbnail {
          gatsbyImageData
        }
        content {
          childMarkdownRemark {
            html
          }
        }
        createdAt(formatString: "YYYY.MM.DD.")
      }
    }
    file(name: { eq: "profile-image" }) {
      childImageSharp {
        gatsbyImageData(width: 120, height: 120)
      }
    }
  }
`;
