
export declare class DummyClass {
  /** Find the first node with the specified title */
  public findByTitle(title: string): object;
}

export type ResourceId = string;

/**
 * Number of miliseconds elapsed since the UNIX epoch.
 */
export type Timestamp = number;

/**
 * Monotonic increasing version number of a resource.
 */
export type ResourceVersion = number;

/**
 * List of tags that a resource has.
 */
export type ResourceTagList = Array<string>;

/**
 * Description of a resource
 */
export type ResourceDescription = {
  name: string;
  description?: string;
  tags?: ResourceTagList;
};

export type UserRole = 'guest' | 'user';

export type OrgUserRole = 'manager' | 'admin' | 'subscriber' | 'system_admin';

export type StandaloneUserRole = 'free_user' | 'paid_user';

/**
 * A system wide user role.
 */
export type SystemRole = UserRole | OrgUserRole | StandaloneUserRole;

/**
 * OAuth 2.0 grant types used in differnt OAuth 2.0 flows. See https://oauth.net/2/.
 */
export type OAuthGrantType = 'authorization_code' | 'client_credentials' | 'refresh_token';

export type OAuthGrantTypes = Array<OAuthGrantType>;

/**
 * OAuth 2.0 response types used in differnt OAuth 2.0 flows. See https://oauth.net/2/.
 */
export type OAuthResponseType = Array<'token' | 'code'>;

/**
 * A related resource link (see hateoas principles).
 */
export type ResourceLink = {
  href: string;
  /**
   * Indicates whether href" property is a URI Template.
   */
  templated?: boolean;
  /**
   * Intended for labelling the link with a human-readable identifier.
   */
  title?: string;
  /**
   * May be used as a secondary key for selecting Link Objects which share the same relation type.
   */
  name?: string;
};

/**
* hateoas object containing links to self and related resources.
* @see HAL spec at http://stateless.co/hal_specification.html
* @see https://tools.ietf.org/html/draft-kelly-json-hal-08
*/
export type HateoasLinks = {
  self: ResourceLink;
  /**
   * Templates to generate links.
   */
  curies?: Array<ResourceLink>;
  [key: string]: (ResourceLink | Array<ResourceLink>) | ResourceLink | Array<ResourceLink> | undefined;
};

export type HateoasEmbedded = ResourceDescription & {
  id: ResourceId;
  externalId?: string;
  version: ResourceVersion;
  entityType?: 'application' | 'other';
  _links?: HateoasLinks;
};

/** */
export type BaseApplicationAttributes = {
  oauthGrantTypes?: OAuthGrantTypes;
  oauthResponseTypes?: OAuthResponseType;
  organisation?: ResourceId;
};

/**
 * An application body.
 * 
 * @usageNotes
 * 
 * Some useful notes about the application body.
 */
export type ApplicationBody = BaseApplicationAttributes & {
  /**
   * Expiration of access tokens in minutes. Cannot be greater than the refresh token expiration.
   */
  accessTokenExpiration: number;
  /**
   * Expiration of id tokens in minutes. Cannot be greater than the refresh token expiration.
   */
  idTokenExpiration: number;
  /**
   * Expiration of refresh tokens in minutes.
   */
  refreshTokenExpiration: number;
  /**
   * Callback URIs.
   */
  callbackURIs?: Array<string>;
  /**
   * Allowed redirection URLs for logout.
   */
  logoutURLs?: Array<string>;
  /** */
  clientCredentialsRole?: SystemRole;
  /**
   * List of scopes allowed for this application.
   */
  allowedScopes?: Array<string>;
};

/**
 * Simple resource profile.
 */
export type SimpleResourceResponse = HateoasEmbedded & {
  modifier: string;
  creator: string;
  /** The owner of the resource. */
  owner: string;
  created: Timestamp;
  modified: Timestamp;
  isEnabled: boolean;
  eTag: string;
  writable?: boolean;
  findable?: boolean;
  readable?: boolean;
};

export type BaseLinks = HateoasLinks & {
  creator?: ResourceLink;
  modifier?: ResourceLink;
  owner?: ResourceLink;
};

export type BaseEmbedded = {
  creator?: HateoasEmbedded;
  modifier?: HateoasEmbedded;
  owner?: HateoasEmbedded;
};

export type ApplicationLinks = BaseLinks & {
  providers?: ResourceLink;
  organisation?: ResourceLink;
};

export type ApplicationEmbedded = BaseEmbedded & {
  organisation: HateoasEmbedded;
};

export type SimpleApplicationProfile = SimpleResourceResponse & BaseApplicationAttributes & {
  _embedded?: ApplicationEmbedded;
  _links?: ApplicationLinks;
};

export type ApplicationProfile = SimpleApplicationProfile & ApplicationBody;
