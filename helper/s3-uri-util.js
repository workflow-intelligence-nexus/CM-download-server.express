function replaceWithCustomDomain(source, domain) {
  const sourceUrl = new URL(source);
  const domainUrl = new URL(domain);
  if (!sourceUrl.host.startsWith('s3')) {
    return source;
  }
  sourceUrl.protocol = domainUrl.protocol;
  sourceUrl.host = domainUrl.host;
  sourceUrl.pathname = sourceUrl.pathname.replace(/^(\/[^\/]+)/, '');
  return sourceUrl.toString();
}

module.exports.replaceWithCustomDomain = replaceWithCustomDomain;
