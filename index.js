import express from "express";
import connectDB from "./db/mongodb.js";
import route from "./routes/routes.js";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import router from "./routes/adminRoute.js";

const app = express();
const port = 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/myapi", route, router);

connectDB();

const options = {
  definition: {
    openapi: "3.1.0",
    info: {
      title: "My First API",
      version: "0.1.0",
      description:
        "Login and enjoy or get the code from https://github.com/HassanAarish/library-backend",
      license: {
        name: "MIT",
        url: "https://spdx.org/licenses/MIT.html",
      },
      contact: {
        name: "LogRocket",
        url: "https://logrocket.com",
        email: "info@email.com",
      },
    },
    servers: [
      {
        url: "http://localhost:5000/myapi",
      },
    ],
    components: {
      securitySchemes: {
        Authorization: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          value: "Bearer <JWT token here>",
        },
      },
    },
  },
  apis: ["./routes/routes.js", "./routes/adminRoute.js"], // Path to your book.js route file
};

// Generate Swagger specification
const specs = swaggerJsdoc(options);

// Serve Swagger documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(specs, {
    explorer: true,
    swaggerOptions: {
      defaultModelsExpandDepth: -1,
      displayRequestDuration: true,
      docExpansion: "list", // Controls the default expansion setting for operations and tags.
      defaultModelRendering: "model",
    },
  })
);

app.listen(port, () => {
  console.log(`The server is successfully running on port ${port}`);
});
