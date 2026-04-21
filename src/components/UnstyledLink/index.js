import React from "react";
import { Link } from "gatsby";

export const UnstyledLink = ({ to, children, className, ...rest }) => {
  const isInternal = /^\/(?!\/)/.test(to);

  if (isInternal) {
    return (
      <Link to={to} className={className} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <a href={to} target="_blank" rel="noopener noreferrer" className={className} {...rest}>
      {children}
    </a>
  );
};
