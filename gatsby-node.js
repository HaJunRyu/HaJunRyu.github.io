const path = require('path');
const { createFilePath } = require(`gatsby-source-filesystem`);

// Setup Import Alias
exports.onCreateWebpackConfig = ({ getConfig, actions }) => {
  const output = getConfig().output || {};

  actions.setWebpackConfig({
    output,
    resolve: {
      alias: {
        components: path.resolve(__dirname, 'src/components'),
        utils: path.resolve(__dirname, 'src/utils'),
        hooks: path.resolve(__dirname, 'src/hooks'),
      },
    },
  });
};

exports.createPages = async ({ graphql, actions, reporter }) => {
  const { createPage } = actions;
  const blogPostTemplate = path.resolve(`src/templates/post_template.tsx`);
  // Query for markdown nodes to use in creating pages.
  // You can query for whatever data you want to create pages for e.g.
  // products, portfolio items, landing pages, etc.
  // Variables can be added as the second function parameter
  const result = await graphql(
    `
      query myQuery {
        allContentfulBlogPost {
          nodes {
            slug
          }
        }
      }
    `,
    { limit: 1000 }
  );

  if (result.errors) {
    reporter.panicOnBuild(`Error while running query`);
    return;
  }

  const contentfulPosts = result.data.allContentfulBlogPost.nodes;

  const generatePostPage = ({ slug }) => {
    createPage({
      path: `/${slug}`,
      component: blogPostTemplate,
      context: {
        slug,
      },
    });
  };

  contentfulPosts.forEach(generatePostPage);
};
