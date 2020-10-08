'use strict';

const Joi = require('joi');

/**
 * A group of commands must satisfy these requirements:
 * 1. Must be an array of functions
 * 2. Each function must have a property called `registry`
 * 3. Property `registry` must be valid:
 *    1. Property `name` is required
 *    2. Property `description` is optional
 *    3. Property `options` an optional array. Each option must be valid if present:
 *      1. Property `flag` is required
 *      2. Property `description` is optional
 *      3. Property `coercion` is an optional function, has no-less-than 1 param
 *      and no-more-than 2 params
 *      4. Property `initValue` may be present ONLY IF `coercion` is present
 *      5. Property `regex` is optional RegExp instance
 *      5. Property `defaultValue` is optional
 *
 * @param {Array<Function>} cmds A group of commands
 */
module.exports = function validateLoadedCommandGroup (cmds) {

    const optionsRules = Joi.array().optional().min(1).items(
        Joi.object()
            .keys({
                flag        : Joi.string().required(),
                description : Joi.string().optional(),
                coercion    : Joi.func().optional().minArity(1).maxArity(2),
                initValue   : Joi.any().optional(),
                regex       : Joi.object().type(RegExp),
                defaultValue: Joi.any().optional()
            })
            .nand('coercion', 'regex')
            .nand('coercion', 'defaultValue')
            .with('initValue', 'coercion')
    );

    const registryRules = Joi.object().required().keys({
        name       : Joi.string().required(),
        description: Joi.string().optional(),
        options    : optionsRules
    });

    const rules = Joi.array().items(
        Joi.func().concat(
            Joi.object().keys({
                registry: registryRules
            })
        )
    );

    const validationResult = rules.validate(cmds);
    if (validationResult.error)
        throw validationResult.error;
};
