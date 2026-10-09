# Fox Renard

Open-source, privacy-first comments and reactions embedded in websites. This glossary is the shared language between the product, the code and the people building it.

## Tenancy

**Organization**:
The customer of Fox Renard: it owns Sites and groups the Members who manage them.
_Avoid_: Account, Workspace, Tenant, Customer

**Member**:
A person who can sign in to an Organization's console to manage its Sites.
_Avoid_: Admin, User, Owner, Staff

**Site**:
A website, owned by one Organization, on which Fox Renard is embedded.
_Avoid_: Website, Project, Property

**Allowed Domain**:
A domain from which a Site accepts its embed; requests from any other domain are refused.
_Avoid_: Origin, Whitelist

**Page**:
One place on a Site where Comments and Reactions are gathered.
_Avoid_: Thread, Article, Post, URL

**Page Key**:
The stable identifier a Site gives to a Page, for example `article-{slug}`; it never changes.
_Avoid_: Page ID, Slug, Identifier

## People

**Visitor**:
A person viewing a Site's Pages, known only by their browser. A Visitor can react and vote without giving a name.
_Avoid_: User, Reader, Anonymous

**Commenter**:
A Visitor who has posted on a Site under a display name. A Commenter exists within one Site only.
_Avoid_: User, Author, Profile, Account

**Guest**:
A Commenter whose email address is not verified.
_Avoid_: Anonymous, Unverified user

**Verified Commenter**:
A Commenter who confirmed their email address on that Site through a link sent by email. Their Reactions and Votes count as verified.
_Avoid_: Registered user, Logged-in user, Member

## Conversation

**Comment**:
A message a Commenter posts on a Page.
_Avoid_: Post, Message, Review

**Reply**:
A Comment answering a top-level Comment. Replies are never nested further.
_Avoid_: Sub-comment, Child comment, Nested comment

**Pending Comment**:
A Comment held back from public view until a Member approves it.
_Avoid_: Moderated comment, Queued comment, Held comment

**Photo**:
An image a Verified Commenter attaches to a Comment.
_Avoid_: Media, Attachment, Upload

**Vote**:
A Visitor's thumbs-up or thumbs-down on a Comment.
_Avoid_: Like, Upvote, Rating

**Report**:
A Visitor's notice to a Site's Members that a Comment or Photo may be illegal or abusive.
_Avoid_: Flag, Complaint

## Reactions

**Reaction Set**:
A Site's prompt and its ordered Reaction Options, shared by all the Site's Pages.
_Avoid_: Emoji set, Reaction config

**Reaction Option**:
One picto with its label that a Visitor can choose in a Reaction Set.
_Avoid_: Emoji, Reaction type

**Reaction**:
A Visitor's single, changeable choice of one Reaction Option on a Page.
_Avoid_: Like, Rating, Emoji
