const verifyUserRole = (...roles) => {
  return (req, res) => {
    if (!req?.userRole) {
      res.status(404).json({
        message: "Unable to verify admin: ",
      });
    }
    const allowedRoles = ["admin", "user"];
    const isAllowed = roles.some((role) => allowedRoles.includes(role));

    if (!isAllowed) {
      res.status(404).json({
        message: "Unable to verify admin: ",
      });
    }
    next();
  };
};

export default verifyUserRole;
