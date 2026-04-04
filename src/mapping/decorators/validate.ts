const VALIDATION_METADATA = new WeakMap<
  object,
  Map<string, ValidationRule[]>
>();

interface ValidationRule {
  readonly type: "notNull" | "email" | "min" | "max";
  readonly value?: number;
}

function addRule(
  target: object,
  propertyKey: string,
  rule: ValidationRule,
): void {
  let classRules = VALIDATION_METADATA.get(target);
  if (classRules === undefined) {
    classRules = new Map();
    VALIDATION_METADATA.set(target, classRules);
  }
  let fieldRules = classRules.get(propertyKey);
  if (fieldRules === undefined) {
    fieldRules = [];
    classRules.set(propertyKey, fieldRules);
  }
  fieldRules.push(rule);
}

/** Marks a property as required — validates that the value is not null or undefined. */
export function NotNull(
  _target: undefined,
  context: ClassFieldDecoratorContext,
): void {
  const name = String(context.name);
  context.addInitializer(function () {
    addRule(Object.getPrototypeOf(this as object) as object, name, {
      type: "notNull",
    });
  });
}

/** Validates that a string property matches an email format. */
export function Email(
  _target: undefined,
  context: ClassFieldDecoratorContext,
): void {
  const name = String(context.name);
  context.addInitializer(function () {
    addRule(Object.getPrototypeOf(this as object) as object, name, {
      type: "email",
    });
  });
}

/** Validates that a numeric property is >= the specified minimum. */
export function Min(value: number) {
  return (_target: undefined, context: ClassFieldDecoratorContext): void => {
    const name = String(context.name);
    context.addInitializer(function () {
      addRule(Object.getPrototypeOf(this as object) as object, name, {
        type: "min",
        value,
      });
    });
  };
}

/** Validates that a numeric property is <= the specified maximum. */
export function Max(value: number) {
  return (_target: undefined, context: ClassFieldDecoratorContext): void => {
    const name = String(context.name);
    context.addInitializer(function () {
      addRule(Object.getPrototypeOf(this as object) as object, name, {
        type: "max",
        value,
      });
    });
  };
}

/** Retrieves all validation rules for a class instance's prototype. */
export function getValidationRules(
  target: object,
): Map<string, ValidationRule[]> {
  return (
    VALIDATION_METADATA.get(Object.getPrototypeOf(target) as object) ??
    new Map()
  );
}
