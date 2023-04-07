export type NgDocHandler<T, G> = (item: T) => G;

export type NgDocBooleanHandler<T> = NgDocHandler<T, boolean>;

export type NgDocStringHandler<T> = NgDocHandler<T, string>;

export type NgDocNumberHandler<T> = NgDocHandler<T, number>;
