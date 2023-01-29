## Pattern matching in C++14

**Note 1:** (motivation). Consider the following code:

```cpp
// Declared above:
// DoWorkImplVector( std::vector<int>& )
// DoWorkImplMap( std::map<int, int>& )

template<typename _Type>
void DoWork( _Type& value )
{
    if (std::is_same<_Type, std::vector<int>>) {
        DoWorkImplVector( value );
    }
    else {
        DoWorkImplMap( value );
    }
}

// ...

std::vector<int> vect = /* ... */;
DoWork( vect );
```

It results into a compilation error, because we can not call `DoWorkImplMap` with `std::vector<int>` as a parameter.
We can write a simple workaround using tag dispatch technique (remember, it is C++14), but can we do better? 
The answer is "yes" and I'll explain how to rewrite this code in a beautiful way.

But firstly, I need to say, that in C++**17** we can replace `if (std::is_same<_Type, std::vector<int>>)` with
`if constexpr (std::is_same<_Type, std::vector<int>>)`. And thats it! But I think, there are many necessary applications
for pattern matching even in C++17 and newer.

----

### Part 1. What is pattern matching?

I think the best way to understand this concept is to look at code sample (Haskell):

```haskell
map _ []     = []
map f (x:xs) = f x : map f xs
```

- `f` is a pattern which matches anything at all, and binds the f variable to whatever is matched.
- `(x:xs)` is a pattern that matches a non-empty list which is formed by something (which gets bound 
to the x variable) which was cons'd (by the (:) function) onto something else (which gets bound to xs).
- `[]` is a pattern that matches the empty list. It doesn't bind any variables.
- `_` is the pattern which matches anything without binding (wildcard, "don't care" pattern).

As shown above there are 4 patterns (2 for each of 2 arguments). By calling a `map` with specified parameters
compiler compares them with corresponding patterns. This is kinda overload resolution in C++.

As soon as we know yet what is pattern matching, we can consider using similar way to solve problem mentioned
in the beginning of article. It is possible to use, because pattern matching has a lot similar properties
with overload resolution, so we can extend it to be able to call not only functions, but also functors,
lambdas and other callables in one statement (with compile-time decision which to call). The main advantage
is that this resolution is **compile-time**, because this way we don't substitute arguments to wrong functions.

----

### Part 2. From idea to implementation

First of all we need a main function, that receives variadic number of arguments (that will be passed to 
winner-function as parameters) and variadic pack of callable objects. Because one template function
cannot receive two variadic type packs we will pass arguments in tuple:

```cpp
template<typename _TiedArgs, typename... _Callables>
decltype(auto) Match( _TiedArgs&& tpl, _Callables&&... callables )
{
    // Checks are removed
    return _Match_Impl(
        std::forward<_TiedArgs>( tpl ), std::forward<_Callables>( callables )...
    );
}
```

This implementation is quite simple: firstly we need to check if there is at least one callable (we don't check
here if it is actually a callable object, it'll be checked later), here we assume it to be an invocable object.
Then we forward all arguments to function, that goes through each callable in pack and matches arguments list
with passed tuple using weak comparison (see below). In case of one remaining callable we delegate execution
to invoker-function (it will be described below).

```cpp
template<typename _TiedArgs, typename _Callable, typename... _Callables> 
decltype(auto) _Match_Impl( _TiedArgs&& tpl, _Callable&& callable, _Callables&&... callables )
{
    using _ExactArgs = utils::ArgsOf<_Callable>;
    using _MatchCondition = traits::disjunction<
        traits::is_same_tuple_weak<_ExactArgs::Args,  _TiedArgs>,
        traits::is_same_tuple_weak<_ExactArgs::LRefs, _TiedArgs>,
        traits::is_same_tuple_weak<_ExactArgs::RRefs, _TiedArgs>
    >;

    return _Match_Impl_Dispatch(
        _MatchCondition{},
        std::forward<_TiedArgs>( tpl ),
        std::forward<_Callable>( callable ),
        std::forward<_Callables>( callables )...
    );
}

template<typename _TiedArgs, typename _Callable> 
decltype(auto) _Match_Impl( _TiedArgs&& tpl, _Callable&& callable )
{
    return _Match_Impl_Call(
        std::forward<_TiedArgs>( tpl ),
        std::forward<_Callable>( callable ),
        std::make_index_sequence<std::tuple_size<_TiedArgs>::value>{}
    );
}
```

Implementation of `_Match_Impl` doesn't seems to be complicated too. It has two overloads: with variadic pack of
callables and with only one. The second one, as said above, we just call invoker-function, that makes an attempt
to call the last remaining (from initial variadic pack) fucntion with specified arguments. The first overload is 
more interesting. Full implementation of `ArgsOf` you can find in my GitHub repo (it will be provided in the end
of this article). For future understanding you need to know, that it has three fields: `Args`, `LRefs`, `RRefs` - 
tuples with exact arguments types, lvalue references to arguments types and rvalue references to arguments types
respectively. These tuples are weakly compared to passed to `Match` tuple. What is weak comparison in this case?
Tuples are weakly equal if they have the same size AND all corresponding decayed types are either the same or make
a hierarchy (base - derived). This weak comparison is implemented in `is_same_tuples_weak` trait. I think, this is
quite easy part of code and there is no need to place it into this article (you can find it in the repository).

Let's go to the most interestion things: `_Match_Impl_Dispatch` and `_Match_Impl_Call`. The idea of 
`_Match_Impl_Dispatch` is to use tag dispatch technique to chose between calling chosen matched function or going
to the next function in pack:

```cpp
template<typename _TiedArgs, typename _Callable, typename... _Callables> 
decltype(auto) _Match_Impl_Dispatch( std::true_type, _TiedArgs&& tpl, _Callable&& callable, _Callables&&... )
{
    return _Match_Impl_Call( 
        std::forward<_TiedArgs>( tpl ),
        std::forward<_Callable>( callable ),
        std::make_index_sequence<std::tuple_size<_TiedArgs>::value>{}
    );
}

template<typename _TiedArgs, typename _Callable, typename... _Callables> 
decltype(auto) _Match_Impl_Dispatch( std::false_type, _TiedArgs&& tpl, _Callable&&, _Callables&&... callables )
{
    return _Match_Impl(
        std::forward<_TiedArgs>( tpl ),
        std::forward<_Callables>( callables )...
    );
}
```

Remember `_MatchCondition` from `_Match_Impl` - it is the first argument of these functions. If condition is true
(it means that types are weakly the same), than _MatchCondition is derived from `std::true_type`, otherwise - from
`std::false_type`. This is the key of tag dispatch. The first overload forwards all arguments and callable to invoker,
that unpacks tuple and pass all the arguments to callable. `index_sequence` is necessary for expanding `std::tuple`
using `std::get` (see below). The second overload makes one step backwards, but with reduced by one pack of callables.

Now it's time to look at invoker function:

```cpp
template<typename _TiedArgs, typename _Callable, size_t... _Idxs> 
decltype(auto) _Match_Impl_Call( _TiedArgs&& tpl, _Callable&& callable, std::index_sequence<_Idxs...> )
{
    // Checks are removed
    return callable( 
        std::get<_Idxs>( std::forward<_TiedArgs>( tpl ) )... 
    );
}
```

It is another extremely simple function, that uses variadic pack of indices expansion in application to `std::get` to
extract arguments from `std::tuple` and pass them into a chosen callable object. 

That's it! As you can see, there's nothing extremely complicated in writing an emulation of pattern matching.

----

### Part 3. Usage

Now is the time to look, how it works. Return for a moment to the beginning of the article to remember the example provided
there and come back :) This code can be implemented using the library as following:

```cpp
// Declared above:
// DoWorkImplVector( std::vector<int>& )
// DoWorkImplMap( std::map<int, int>& )

template<typename _Type>
void DoWork( _Type& value )
{
    match::Match(
        std::make_tuple( value ),
        []( std::vector<int>& v )   { return DoWorkImplVector( v ); },
        []( std::map<int, int>& m ) { return DoWorkImplMap( m ); }
    );
}

// ...

std::vector<int> vect = /* ... */;
DoWork( vect );
```

Now it successfully compiles and works fine! Or you can do it in a short form:

```cpp
template<typename _Type>
void DoWork( _Type& value )
{
    match::Match(
        std::make_tuple( value ),
        DoWorkImplVector,
        DoWorkImplMap
    );
}
```

Isn't it a beauty and astonishing power of C++ and templates? Isn't it just one more cool thing you can do in C++?
I think, that this approach can make our code more cleaner by removing if-else chains and tag dispatching in some
cases, where they were the only solutions.

----

[PatternMatching](https://github.com/GeorgyFirsov/PatternMatching) library on GitHub.

Author: Georgy Firsov. 2020
