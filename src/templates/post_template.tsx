import React, { FunctionComponent } from 'react';
import { graphql } from 'gatsby';
import { PostListItemType } from 'types/PostItem.types'; // 바로 아래에서 정의할 것입니다
import Template from 'components/Common/Template';
import PostHead from 'components/Post/PostHead';
import PostContent from 'components/Post/PostContent';
import CommentWidget from 'components/Post/CommentWidget';

type PostTemplateProps = {
  data: {
    contentfulBlogPost: PostListItemType;
  };
};

const PostTemplate: FunctionComponent<PostTemplateProps> = function ({
  data: {
    contentfulBlogPost: { categories, content, createdAt, thumbnail, title },
  },
}) {
  return (
    <Template>
      <PostHead
        title={title}
        date={createdAt}
        categories={categories}
        thumbnail={thumbnail.gatsbyImageData}
      />
      <PostContent html={content.childMarkdownRemark.html} />
      <CommentWidget />
    </Template>
  );
};

export default PostTemplate;

export const queryMarkdownDataBySlug = graphql`
  query myQuery($slug: String) {
    contentfulBlogPost(slug: { eq: $slug }) {
      title
      createdAt(formatString: "YYYY.MM.DD.")
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
    }
  }
`;
