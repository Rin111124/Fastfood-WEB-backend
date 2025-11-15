const getHomePage = (req, res) => {
  const user = req.session?.user;
  if (user?.role === "admin") {
    return res.redirect("/admin");
  }
  if (user?.role === "staff") {
    return res.redirect("/staff");
  }
  return res.render("homepage.ejs");
};

export { getHomePage };
