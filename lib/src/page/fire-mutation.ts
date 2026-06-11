import type { FireMutationArg, FireMutationResult } from "../types.ts";

/**
 * MUST run in MAIN world — accesses window.__APOLLO_CLIENT__.
 *
 * Constructs the UpdateCartItemsMutation DocumentNode manually rather than
 * extracting it from webpack bundles. The bundle-extraction approach broke
 * because the AST literal references closure-scoped variables (the `d` function
 * and `s.ay` fragment module) that are unreachable from outside the module.
 *
 * The manual document uses inline field selections instead of fragment spreads,
 * so it produces a different hash than the original. Apollo falls back to sending
 * the full query body on PersistedQueryNotFound, and the server accepts it.
 */

export async function pageFireMutation(arg: FireMutationArg): Promise<FireMutationResult> {
  const MUTATION_DOC = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "UpdateCartItemsMutation" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "cartId" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          defaultValue: undefined,
          directives: [],
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "cartType" } },
          type: { kind: "NonNullType", type: { kind: "NamedType", name: { kind: "Name", value: "CartType" } } },
          defaultValue: undefined,
          directives: [],
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "requestTimestamp" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Float" } },
          defaultValue: undefined,
          directives: [],
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "cartItemUpdates" } },
          type: {
            kind: "NonNullType",
            type: {
              kind: "ListType",
              type: { kind: "NonNullType", type: { kind: "NamedType", name: { kind: "Name", value: "CartItemUpdateInput" } } },
            },
          },
          defaultValue: undefined,
          directives: [],
        },
      ],
      directives: [],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "updateCartItems" },
            arguments: [
              { kind: "Argument", name: { kind: "Name", value: "cartId" },          value: { kind: "Variable", name: { kind: "Name", value: "cartId" } } },
              { kind: "Argument", name: { kind: "Name", value: "cartType" },        value: { kind: "Variable", name: { kind: "Name", value: "cartType" } } },
              { kind: "Argument", name: { kind: "Name", value: "requestTimestamp" }, value: { kind: "Variable", name: { kind: "Name", value: "requestTimestamp" } } },
              { kind: "Argument", name: { kind: "Name", value: "cartItemUpdates" }, value: { kind: "Variable", name: { kind: "Name", value: "cartItemUpdates" } } },
            ],
            directives: [],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "cart" },
                  arguments: [],
                  directives: [],
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" },        arguments: [], directives: [] },
                      { kind: "Field", name: { kind: "Name", value: "itemCount" }, arguments: [], directives: [] },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "cartItemCollection" },
                        arguments: [],
                        directives: [],
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "cartItems" },
                              arguments: [],
                              directives: [],
                              selectionSet: {
                                kind: "SelectionSet",
                                selections: [
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "basketProduct" },
                                    arguments: [],
                                    directives: [],
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        { kind: "Field", name: { kind: "Name", value: "productId" }, arguments: [], directives: [] },
                                        { kind: "Field", name: { kind: "Name", value: "v4ItemId" },  arguments: [], directives: [] },
                                      ],
                                    },
                                  },
                                  { kind: "Field", name: { kind: "Name", value: "quantity" },     arguments: [], directives: [] },
                                  { kind: "Field", name: { kind: "Name", value: "quantityType" }, arguments: [], directives: [] },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
};

  const w = window as unknown as {
    __APOLLO_CLIENT__?: {
      mutate: (opts: { mutation: unknown; variables: unknown; fetchPolicy?: string }) => Promise<{ data?: unknown; errors?: unknown[] }>;
    };
  };
  const client = w.__APOLLO_CLIENT__;
  if (!client) return { ok: false, error: "window.__APOLLO_CLIENT__ not exposed" };

  try {
    const variables: Record<string, unknown> = {
      cartType: arg.cartType,
      requestTimestamp: Date.now(),
      cartItemUpdates: arg.cartItemUpdates,
    };
    if (arg.cartId) variables.cartId = arg.cartId;

    const res = await client.mutate({ mutation: MUTATION_DOC, variables, fetchPolicy: "no-cache" });

    if (res.errors?.length) {
      return { ok: false, error: `graphql errors: ${JSON.stringify(res.errors).slice(0, 500)}` };
    }

    const data = res.data as {
      updateCartItems?: {
        cart?: {
          id: string;
          itemCount: number;
          cartItemCollection?: {
            cartItems?: Array<{
              basketProduct: { productId: string; v4ItemId: string };
              quantity: number;
              quantityType: string;
            }>;
          };
        };
      };
    } | undefined;

    const cart = data?.updateCartItems?.cart;
    if (!cart) return { ok: false, error: "mutation returned no cart" };

    return {
      ok: true,
      cart: {
        id: cart.id,
        itemCount: cart.itemCount,
        items: (cart.cartItemCollection?.cartItems ?? []).map((ci) => ({
          productId: ci.basketProduct.productId,
          v4ItemId: ci.basketProduct.v4ItemId,
          quantity: ci.quantity,
          quantityType: ci.quantityType,
        })),
      },
    };
  } catch (e) {
    return { ok: false, error: `apollo mutate threw: ${(e as Error).message}` };
  }
}
