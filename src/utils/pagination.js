/**
 * Parse pagination params from request query.
 * Defaults: page=1, limit=20, max limit=100.
 */
const parsePagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Build the meta object to attach to list responses.
 */
const buildPaginationMeta = ({ total, page, limit }) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
  hasNextPage: page * limit < total,
  hasPrevPage: page > 1,
});

/**
 * Parse sort from query: "createdAt" → asc, "-createdAt" → desc.
 * @param {string} sortStr - e.g. "-createdAt" or "priority"
 * @param {string[]} allowedFields - whitelist to prevent arbitrary sort injection
 */
const parseSort = (sortStr, allowedFields = ["createdAt"]) => {
  if (!sortStr) return { createdAt: -1 };

  const order = sortStr.startsWith("-") ? -1 : 1;
  const field = sortStr.replace(/^-/, "");

  if (!allowedFields.includes(field)) return { createdAt: -1 };
  return { [field]: order };
};

module.exports = { parsePagination, buildPaginationMeta, parseSort };
