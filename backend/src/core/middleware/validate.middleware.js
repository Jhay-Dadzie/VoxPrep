import BadRequestError from '../errors/badRequestError.js';

/**
 * Validate one part of the request against a Joi schema, replacing it with the
 * coerced and defaulted value so handlers can trust what they read.
 *
 * `abortEarly: false` reports every problem at once — one round trip instead of
 * one per mistake. `stripUnknown` drops anything the schema does not name.
 */
export function validate(schema, property = 'body') {
  return (req, _res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return next(
        new BadRequestError(
          'Validation failed',
          error.details.map((d) => ({ field: d.path.join('.'), message: d.message })),
        ),
      );
    }

    req[property] = value;
    next();
  };
}
